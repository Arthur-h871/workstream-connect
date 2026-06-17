import { createFileRoute } from "@tanstack/react-router";
import { Plus, Circle, CheckCircle2, Trash2, X, Search } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getApontamentos,
  createApontamento,
  updateApontamento,
  deleteApontamento,
  linkPersonalTask,
  linkOrgTask,
  updateLinkedTaskStatus,
  unlinkTask,
  type Apontamento,
  type LinkedTask,
} from "backend/api/services/apontamentos.service";
import { getPersonalTasks, type PersonalTask } from "backend/api/services/tarefas.service";
import { getMyOrgTasks, type OrgTask } from "backend/api/services/org-tasks.service";
import {
  getScreenshots,
  softDeleteScreenshot,
  type Screenshot,
} from "backend/api/services/screenshots.service";

export const Route = createFileRoute("/_authenticated/apontamentos")({
  head: () => ({
    meta: [
      { title: "Apontamentos — Marco" },
      {
        name: "description",
        content: "Visualize e gerencie seus apontamentos diários.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const apontamentos = await getApontamentos(context.profile.id);
    return {
      apontamentos,
      userId: context.profile.id,
      orgId: context.profile.organization_id,
    };
  },
  component: ApontamentosPage,
});

function ApontamentosPage() {
  const { apontamentos: initial, userId, orgId } = Route.useLoaderData();
  const [items, setItems] = useState<Apontamento[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);

  const selected = items.find((a) => a.id === selectedId) ?? null;

  async function handleCreate() {
    try {
      const novo = await createApontamento({
        user_id: userId,
        organization_id: orgId,
        date: new Date().toISOString().split("T")[0],
        content: "",
        hours_worked: 0.25,
      });
      setItems((prev) => [novo, ...prev]);
      setSelectedId(novo.id);
    } catch {
      // silently ignore — user sees no new item appear
    }
  }

  function handleUpdate(id: string, fields: Partial<Apontamento>) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...fields } : a)));
  }

  async function handleDelete(id: string) {
    const remaining = items.filter((a) => a.id !== id);
    setItems(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    await deleteApontamento(id);
  }

  return (
    <AppShell>
      <div className="-mx-8 -my-8 flex h-screen bg-background">
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h1 className="text-base font-semibold">Apontamentos</h1>
            <button
              onClick={handleCreate}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-copper text-primary-foreground hover:opacity-90"
              aria-label="Novo apontamento"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {items.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Nenhum apontamento registrado
              </div>
            ) : (
              <div className="relative pl-5">
                <div className="absolute bottom-2 left-1.5 top-2 w-px bg-border" />
                <div className="space-y-2">
                  {items.map((item) => {
                    const active = item.id === selectedId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`relative block w-full rounded-md p-3 text-left transition-colors ${
                          active
                            ? "border-l-2 border-copper bg-surface pl-[10px]"
                            : "hover:bg-surface"
                        }`}
                      >
                        <span
                          className={`absolute -left-[14px] top-4 h-2 w-2 rounded-full ring-4 ring-background ${
                            active ? "bg-copper" : "bg-border"
                          }`}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-copper">
                            {formatDate(item.date)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatTime(item.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {item.content || "Sem conteúdo"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex-1 overflow-y-auto p-8">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Selecione um apontamento ou crie um novo
            </div>
          ) : (
            <ApontamentoDetail
              key={selected.id}
              apontamento={selected}
              userId={userId}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ApontamentoDetail({
  apontamento,
  userId,
  onUpdate,
  onDelete,
}: {
  apontamento: Apontamento;
  userId: string;
  onUpdate: (id: string, fields: Partial<Apontamento>) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);

  useEffect(() => {
    if (!apontamento.session_id) {
      setScreenshots([]);
      return;
    }
    setScreenshotsLoading(true);
    getScreenshots(apontamento.session_id)
      .then((data) => setScreenshots(data))
      .finally(() => setScreenshotsLoading(false));
  }, [apontamento.session_id]);

  async function handleSoftDelete(screenshotId: string) {
    await softDeleteScreenshot(screenshotId);
    setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId));
  }

  function handleContentChange(value: string) {
    onUpdate(apontamento.id, { content: value });
    if (contentTimer.current) clearTimeout(contentTimer.current);
    contentTimer.current = setTimeout(
      () => updateApontamento(apontamento.id, { content: value }),
      800,
    );
  }

  function handleHoursChange(value: string) {
    const hours = parseFloat(value) || 0;
    onUpdate(apontamento.id, { hours_worked: hours });
    if (hoursTimer.current) clearTimeout(hoursTimer.current);
    hoursTimer.current = setTimeout(
      () => updateApontamento(apontamento.id, { hours_worked: hours }),
      800,
    );
  }

  async function handleToggleStatus(task: LinkedTask) {
    const newStatus = task.status === "concluded" ? "started" : "concluded";
    onUpdate(apontamento.id, {
      linked_tasks: apontamento.linked_tasks.map((t) =>
        t.link_id === task.link_id ? { ...t, status: newStatus } : t,
      ),
    });
    await updateLinkedTaskStatus(task.link_id, task.type, newStatus, task.task_id);
  }

  async function handleUnlink(task: LinkedTask) {
    onUpdate(apontamento.id, {
      linked_tasks: apontamento.linked_tasks.filter((t) => t.link_id !== task.link_id),
    });
    await unlinkTask(task.link_id, task.type);
  }

  function handleAdd(newLinks: LinkedTask[]) {
    onUpdate(apontamento.id, {
      linked_tasks: [...apontamento.linked_tasks, ...newLinks],
    });
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      <article className="col-span-12 rounded-lg border border-border bg-surface p-7 lg:col-span-8">
        <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-sm font-medium">{formatDate(apontamento.date)}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatTime(apontamento.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Horas</span>
              <input
                type="number"
                step="0.25"
                min="0"
                defaultValue={apontamento.hours_worked}
                onChange={(e) => handleHoursChange(e.target.value)}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm focus:border-copper focus:outline-none"
              />
            </label>
            <button
              onClick={() => onDelete(apontamento.id)}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Excluir
            </button>
          </div>
        </div>

        <textarea
          rows={10}
          defaultValue={apontamento.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Descreva o que foi feito…"
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />

        <ScreenshotsGallery
          screenshots={screenshots}
          loading={screenshotsLoading}
          onDelete={handleSoftDelete}
        />
      </article>

      <aside className="col-span-12 rounded-lg border border-border bg-surface p-5 lg:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="section-label">Tarefas vinculadas</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Adicionar tarefa"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <ul className="space-y-1">
          {apontamento.linked_tasks.length === 0 ? (
            <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma tarefa vinculada
            </li>
          ) : (
            apontamento.linked_tasks.map((t) => (
              <li
                key={t.link_id}
                className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-background"
              >
                <button
                  onClick={() => handleToggleStatus(t)}
                  aria-label={
                    t.status === "concluded" ? "Marcar como iniciada" : "Marcar como concluída"
                  }
                >
                  {t.status === "concluded" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#10B981] text-background" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-copper" strokeWidth={2.5} />
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    t.status === "concluded"
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {t.title}
                </span>
                <button
                  onClick={() => handleUnlink(t)}
                  aria-label="Desvincular tarefa"
                  className="invisible text-muted-foreground group-hover:visible hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      {showModal && (
        <AddTaskModal
          apontamentoId={apontamento.id}
          alreadyLinked={apontamento.linked_tasks}
          userId={userId}
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function AddTaskModal({
  apontamentoId,
  alreadyLinked,
  userId,
  onAdd,
  onClose,
}: {
  apontamentoId: string;
  alreadyLinked: LinkedTask[];
  userId: string;
  onAdd: (newLinks: LinkedTask[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"personal" | "org">("personal");
  const [query, setQuery] = useState("");
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [orgTasks, setOrgTasks] = useState<OrgTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Map<string, "personal" | "org">());
  const [saving, setSaving] = useState(false);

  const alreadyLinkedIds = new Set(alreadyLinked.map((t) => t.task_id));

  useEffect(() => {
    async function load() {
      const [personal, org] = await Promise.all([getPersonalTasks(userId), getMyOrgTasks(userId)]);
      setPersonalTasks(personal);
      setOrgTasks(org);
      setLoading(false);
    }
    load();
  }, [userId]);

  const filteredPersonal = personalTasks.filter(
    (t) => !alreadyLinkedIds.has(t.id) && t.title.toLowerCase().includes(query.toLowerCase()),
  );

  const filteredOrg = orgTasks.filter(
    (t) => !alreadyLinkedIds.has(t.id) && t.title.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string, type: "personal" | "org") {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, type);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0 || saving) return;
    setSaving(true);

    const results: LinkedTask[] = [];
    await Promise.all(
      Array.from(selected.entries()).map(async ([taskId, type]) => {
        const link =
          type === "personal"
            ? await linkPersonalTask(apontamentoId, taskId)
            : await linkOrgTask(apontamentoId, taskId);
        if (link) results.push(link);
      }),
    );

    onAdd(results);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Adicionar tarefas</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tarefa…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-copper focus:outline-none"
            />
          </div>
        </div>

        <div className="flex border-b border-border">
          {(["personal", "org"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "border-b-2 border-copper text-copper"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "personal" ? "Minhas tarefas" : "Da organização"}
            </button>
          ))}
        </div>

        <div className="max-h-60 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Carregando…</div>
          ) : tab === "personal" ? (
            filteredPersonal.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhuma tarefa disponível
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredPersonal.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-background">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id, "personal")}
                        className="h-3.5 w-3.5 accent-copper"
                      />
                      <span className="text-sm">{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : filteredOrg.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma tarefa disponível
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredOrg.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-background">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id, "org")}
                      className="h-3.5 w-3.5 accent-copper"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{t.title}</p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selecionada(s)` : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || saving}
              className="rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Adicionando…" : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenshotsGallery({
  screenshots,
  loading,
  onDelete,
}: {
  screenshots: Screenshot[];
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-7 border-t border-border pt-5">
        <p className="section-label mb-3">Prints capturados</p>
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-7 border-t border-border pt-5">
      <p className="section-label mb-3">
        Prints capturados · {screenshots.length}
      </p>
      {screenshots.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhum print capturado
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {screenshots.map((s) => (
            <ScreenshotThumb key={s.id} screenshot={s} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScreenshotThumb({
  screenshot,
  onDelete,
}: {
  screenshot: Screenshot;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(screenshot.captured_at));

  return (
    <div
      className="group relative aspect-video overflow-hidden rounded-md border border-border bg-muted"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {screenshot.signedUrl ? (
        <img
          src={screenshot.signedUrl}
          alt={`Screenshot ${timeLabel}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Sem preview
        </div>
      )}

      {hovered && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <button
            onClick={() => onDelete(screenshot.id)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-background hover:opacity-90"
            aria-label="Excluir screenshot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-background/70 px-1.5 py-0.5">
        <span className="font-mono text-[9px] text-muted-foreground">
          {timeLabel}
        </span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(isoStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));
}
