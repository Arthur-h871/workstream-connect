import { useState, useEffect, useMemo } from "react";
import { supabase } from "backend/api/supabase";
import { getPersonalTasks, type PersonalTask } from "backend/api/services/tarefas.service";
import { getMyOrgTasks, type OrgTask } from "backend/api/services/org-tasks.service";
import { getScreenshots } from "backend/api/services/screenshots.service";
import {
  getSession,
  getSessionMessages,
  startMonitoramento,
  chatMonitoramento,
  updatePendingTaskLinks,
  type LinkedTaskPayload,
  type ChatDraft,
  type SessionMessage,
} from "backend/api/services/sessions.service";
import {
  createApontamentoFromDraft,
  linkPersonalTask,
  linkOrgTask,
  updateLinkedTaskStatus,
} from "backend/api/services/apontamentos.service";

type Props = {
  sessionId: string;
  userId: string;
  organizationId: string;
  onComplete: () => void;
};

type TaskKey = string; // `${type}:${task_id}`

function taskKey(type: "personal" | "org", taskId: string): TaskKey {
  return `${type}:${taskId}`;
}

function parseDraftFromMessage(content: string): ChatDraft | null {
  try {
    const parsed = JSON.parse(content);
    return {
      content: String(parsed.content ?? ""),
      hours_worked: Number(parsed.hours_worked) || 0.25,
    };
  } catch {
    return null;
  }
}

export function SessionReviewChat({ sessionId, userId, organizationId, onComplete }: Props) {
  const [phase, setPhase] = useState<"loading" | "linking" | "chatting">("loading");
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [orgTasks, setOrgTasks] = useState<OrgTask[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Map<TaskKey, LinkedTaskPayload>>(new Map());
  const [context, setContext] = useState("");
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState<ChatDraft | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [personal, org, session, history] = await Promise.all([
        getPersonalTasks(userId),
        getMyOrgTasks(userId),
        getSession(sessionId),
        getSessionMessages(sessionId),
      ]);
      if (cancelled) return;

      setPersonalTasks(personal);
      setOrgTasks(org);

      const restored = new Map<TaskKey, LinkedTaskPayload>();
      for (const link of session?.pending_task_links ?? []) {
        restored.set(taskKey(link.type, link.task_id), link);
      }
      setLinkedTasks(restored);

      if (history.length > 0) {
        setMessages(history);
        const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) setDraft(parseDraftFromMessage(lastAssistant.content));
        setPhase("chatting");
      } else {
        setPhase("linking");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId]);

  const linkedList = useMemo(() => Array.from(linkedTasks.values()), [linkedTasks]);

  function toggleTask(type: "personal" | "org", task: PersonalTask | OrgTask) {
    setLinkedTasks((prev) => {
      const next = new Map(prev);
      const key = taskKey(type, task.id);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          task_id: task.id,
          type,
          title: task.title,
          description: task.description,
          status: "started",
        });
      }
      persistLinks(next);
      return next;
    });
  }

  function setTaskStatus(
    type: "personal" | "org",
    taskId: string,
    status: "started" | "concluded",
  ) {
    setLinkedTasks((prev) => {
      const key = taskKey(type, taskId);
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(key, { ...existing, status });
      persistLinks(next);
      return next;
    });
  }

  function persistLinks(links: Map<TaskKey, LinkedTaskPayload>) {
    updatePendingTaskLinks(sessionId, Array.from(links.values())).catch((persistError: unknown) => {
      console.error("Falha ao persistir vínculos de tarefas da sessão:", persistError);
    });
  }

  async function handleStartAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const screenshots = await getScreenshots(sessionId);
      const result = await startMonitoramento({
        sessionId,
        context,
        screenshotIds: screenshots.map((s) => s.id),
        linkedTasks: linkedList,
      });
      setDraft(result);
      setMessages(await getSessionMessages(sessionId));
      setPhase("chatting");
    } catch {
      setError("Falha ao iniciar a análise. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendChat() {
    if (!chatInput.trim() || loading) return;
    setLoading(true);
    setError(null);
    const message = chatInput.trim();
    setChatInput("");
    try {
      const result = await chatMonitoramento(sessionId, message);
      setDraft(result);
      setMessages(await getSessionMessages(sessionId));
    } catch {
      setError("Falha ao enviar mensagem. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const apontamento = await createApontamentoFromDraft({
        user_id: userId,
        organization_id: organizationId,
        session_id: sessionId,
        date: new Date().toISOString().split("T")[0],
        content: draft.content,
        hours_worked: draft.hours_worked,
      });

      for (const t of linkedList) {
        const link =
          t.type === "personal"
            ? await linkPersonalTask(apontamento.id, t.task_id)
            : await linkOrgTask(apontamento.id, t.task_id);
        if (link) await updateLinkedTaskStatus(link.link_id, t.type, t.status, t.task_id);
      }

      await supabase.from("notifications").insert({
        user_id: userId,
        type: "new_org_task",
        title: "Apontamento gerado",
        body: "Seu apontamento foi criado com sucesso.",
        reference_id: apontamento.id,
        reference_type: "apontamento",
      });

      onComplete();
    } catch {
      setError("Falha ao criar o apontamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="mb-6 rounded-lg border border-copper/30 bg-surface p-4 text-sm text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4 rounded-lg border border-copper/30 bg-surface p-4">
      <h2 className="text-base font-semibold">
        {phase === "linking"
          ? "Sessão finalizada — revisar antes de enviar"
          : "Conversando com o Claude"}
      </h2>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {phase === "linking" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Contexto adicional (opcional) — descreva o que foi feito, decisões importantes...
          </label>
          <textarea
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-copper"
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
      )}

      <TaskLinker
        personalTasks={personalTasks}
        orgTasks={orgTasks}
        linkedTasks={linkedTasks}
        onToggle={toggleTask}
        onStatusChange={setTaskStatus}
      />

      {phase === "linking" && (
        <button
          onClick={handleStartAnalysis}
          disabled={loading}
          className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Iniciar análise"}
        </button>
      )}

      {phase === "chatting" && (
        <>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {messages
              .filter((m) => m.role === "user")
              .map((m) => (
                <p key={m.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Você: </span>
                  {m.content.length > 300 ? `${m.content.slice(0, 300)}...` : m.content}
                </p>
              ))}
          </div>

          {draft && (
            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-sm">{draft.content}</p>
              <p className="text-xs text-muted-foreground">Horas estimadas: {draft.hours_worked}</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Pedir um ajuste no relatório
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-copper"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChat();
                }}
              />
              <button
                onClick={handleSendChat}
                disabled={loading || !chatInput.trim()}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={loading || !draft}
              className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Processando..." : "Enviar apontamento"}
            </button>
            <button
              onClick={onComplete}
              disabled={loading}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TaskLinker({
  personalTasks,
  orgTasks,
  linkedTasks,
  onToggle,
  onStatusChange,
}: {
  personalTasks: PersonalTask[];
  orgTasks: OrgTask[];
  linkedTasks: Map<TaskKey, LinkedTaskPayload>;
  onToggle: (type: "personal" | "org", task: PersonalTask | OrgTask) => void;
  onStatusChange: (
    type: "personal" | "org",
    taskId: string,
    status: "started" | "concluded",
  ) => void;
}) {
  if (personalTasks.length === 0 && orgTasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Vincular tarefas a este apontamento
      </p>
      <div className="space-y-1">
        {personalTasks.map((t) => (
          <TaskRow
            key={t.id}
            type="personal"
            task={t}
            link={linkedTasks.get(taskKey("personal", t.id))}
            onToggle={onToggle}
            onStatusChange={onStatusChange}
          />
        ))}
        {orgTasks.map((t) => (
          <TaskRow
            key={t.id}
            type="org"
            task={t}
            link={linkedTasks.get(taskKey("org", t.id))}
            onToggle={onToggle}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  type,
  task,
  link,
  onToggle,
  onStatusChange,
}: {
  type: "personal" | "org";
  task: PersonalTask | OrgTask;
  link: LinkedTaskPayload | undefined;
  onToggle: (type: "personal" | "org", task: PersonalTask | OrgTask) => void;
  onStatusChange: (
    type: "personal" | "org",
    taskId: string,
    status: "started" | "concluded",
  ) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(link)}
          onChange={() => onToggle(type, task)}
          className="accent-copper"
        />
        <span className="truncate text-xs text-muted-foreground">
          [{type === "personal" ? "pessoal" : "org"}] {task.title}
        </span>
      </label>
      {link && (
        <select
          value={link.status}
          onChange={(e) => onStatusChange(type, task.id, e.target.value as "started" | "concluded")}
          className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
        >
          <option value="started">iniciada</option>
          <option value="concluded">concluída</option>
        </select>
      )}
    </div>
  );
}
