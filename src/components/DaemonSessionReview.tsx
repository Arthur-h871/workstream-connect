// workstream-connect/src/components/DaemonSessionReview.tsx
import { useState, useEffect, useMemo } from "react";
import { getApontamentoSummaries } from "backend/api/services/apontamentos.service";

export type SessionScreenshot = {
  id: string;
  signed_url: string;
  captured_at: string;
};

export type DirEntry = {
  dir_id: string;
  path: string;
  description: string;
  diff: { created: string[]; modified: string[]; deleted: string[] };
};

type ApontamentoSummary = {
  id: string;
  date: string;
  content: string;
  hours_worked: number;
};

export type GeneratePayload = {
  session_id: string;
  dir_notes: Record<string, string>;
  screenshot_ids: string[];
  linked_task_context: string;
};

type Props = {
  sessionId: string;
  dirs: DirEntry[];
  screenshots: SessionScreenshot[];
  userId: string;
  onSubmit: (payload: GeneratePayload) => Promise<void>;
  onDiscard: () => void;
};

function totalChanges(diff: DirEntry["diff"]): number {
  return diff.created.length + diff.modified.length + diff.deleted.length;
}

export function DaemonSessionReview({
  sessionId,
  dirs,
  screenshots,
  userId,
  onSubmit,
  onDiscard,
}: Props) {
  const [context, setContext] = useState("");
  const [linkedTaskIds, setLinkedTaskIds] = useState<Set<string>>(new Set());
  const [todayTasks, setTodayTasks] = useState<ApontamentoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    getApontamentoSummaries(userId)
      .then((all) =>
        setTodayTasks(
          (all as ApontamentoSummary[]).filter((a) => a.date === today),
        ),
      )
      .catch(() => setTodayTasks([]));
  }, [userId, today]);

  function toggleTask(id: string) {
    setLinkedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const dirsWithChanges = useMemo(
    () => dirs.filter((d) => totalChanges(d.diff) > 0),
    [dirs],
  );

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const linkedLines = todayTasks
      .filter((t) => linkedTaskIds.has(t.id))
      .map((t) => `- ${t.content}`)
      .join("\n");

    const linked_task_context = [
      context.trim(),
      linkedLines ? `Tarefas do dia:\n${linkedLines}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await onSubmit({
        session_id: sessionId,
        dir_notes: {},
        screenshot_ids: [],
        linked_task_context,
      });
    } catch {
      setError("Falha ao enviar para o Claude. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-lg border border-copper/30 bg-surface p-4">
      <h2 className="text-base font-semibold">
        Sessão finalizada — enviar para Claude
      </h2>

      {dirsWithChanges.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Alterações detectadas:
          </p>
          {dirsWithChanges.map((d) => (
            <div
              key={d.dir_id}
              className="rounded-md border border-border px-3 py-2"
            >
              <p className="font-mono text-xs text-muted-foreground">
                {d.path}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.diff.created.length} criados · {d.diff.modified.length}{" "}
                modificados · {d.diff.deleted.length} deletados
              </p>
            </div>
          ))}
        </div>
      )}

      {screenshots.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Screenshots ({screenshots.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {screenshots.map((sc) => (
              <a key={sc.id} href={sc.signed_url} target="_blank" rel="noreferrer">
                <img
                  src={sc.signed_url}
                  alt={`Screenshot ${sc.captured_at}`}
                  className="h-[90px] w-[120px] rounded-md border border-border object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Contexto adicional (opcional)
        </label>
        <textarea
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-copper"
          rows={3}
          placeholder="Descreva o que foi feito, decisões importantes..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      {todayTasks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Conectar apontamentos do dia:
          </p>
          <div className="space-y-1">
            {todayTasks.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-2"
              >
                <input
                  type="checkbox"
                  checked={linkedTaskIds.has(t.id)}
                  onChange={() => toggleTask(t.id)}
                  className="mt-0.5 accent-copper"
                />
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {t.content}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || dirsWithChanges.length === 0}
          className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Enviar para Claude"}
        </button>
        <button
          onClick={onDiscard}
          disabled={loading}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
