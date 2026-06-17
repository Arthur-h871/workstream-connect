import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Pause, Square, Trash2, GripVertical } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { getDashboardData, type DashboardData } from "backend/api/services/dashboard.service";
import {
  getActiveSession,
  createSession,
  pauseSession,
  resumeSession,
  stopSession,
  deleteSession,
  triggerGenerateReport,
  type CaptureSession,
} from "backend/api/services/sessions.service";
import { DaemonDraftReview } from "@/components/DaemonDraftReview";

const DAEMON_URL = "http://localhost:7432";

type WatchedDir = { id: string; path: string; description: string };

/** Checks whether the local capture daemon is reachable; polls every 10 s. */
function useDaemonStatus(): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const probe = () =>
      fetch(`${DAEMON_URL}/status`)
        .then((r) => r.ok && setOnline(true))
        .catch(() => setOnline(false));

    probe();
    const id = setInterval(probe, 10_000);
    return () => clearInterval(id);
  }, []);

  return online;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Marco" },
      {
        name: "description",
        content: "Resumo do seu trabalho, tarefas e produtividade.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const { id: userId, organization_id: orgId } = context.profile;
    const [session, data] = await Promise.all([getActiveSession(userId), getDashboardData(userId)]);
    return { session, data, fullName: context.profile.full_name, userId, orgId };
  },
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function NotesModal({
  dirs,
  onConfirm,
  onCancel,
}: {
  dirs: WatchedDir[];
  onConfirm: (notes: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  function handleChange(id: string, value: string) {
    setNotes((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold">Notas de encerramento</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Adicione notas opcionais para cada diretório monitorado antes de finalizar a sessão.
        </p>
        {dirs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum diretório monitorado encontrado.</p>
        ) : (
          <div className="space-y-4">
            {dirs.map((dir) => (
              <div key={dir.id}>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {dir.description || dir.path}
                  <span className="ml-1 font-mono text-[10px] opacity-60">{dir.path}</span>
                </label>
                <textarea
                  rows={2}
                  value={notes[dir.id] ?? ""}
                  onChange={(e) => handleChange(dir.id, e.target.value)}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-copper"
                />
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-background"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(notes)}
            className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function Recorder({
  setDaemonDrafts,
  onStopSessionId,
}: {
  setDaemonDrafts: React.Dispatch<React.SetStateAction<unknown[]>>;
  onStopSessionId: (sessionId: string) => void;
}) {
  const { session: initialSession, userId, orgId } = Route.useLoaderData();
  const [session, setSession] = useState<CaptureSession | null>(initialSession);
  const [loading, setLoading] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [watchedDirs, setWatchedDirs] = useState<WatchedDir[]>([]);
  const isStoppingRef = useRef(false);

  const daemonOnline = useDaemonStatus();

  const status = session?.status ?? "idle";
  const isActive = session !== null;

  async function handlePlay() {
    if (loading) return;
    setLoading(true);
    try {
      const newSession = await createSession(userId, orgId);
      setSession(newSession);

      if (daemonOnline) {
        try {
          await fetch(`${DAEMON_URL}/session/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: newSession.id, user_id: userId, org_id: orgId }),
          });
        } catch {
          // best-effort; session continues without daemon
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePauseResume() {
    if (!session || loading) return;
    setLoading(true);
    try {
      if (session.status === "active") {
        await pauseSession(session.id);
        setSession((s) => (s ? { ...s, status: "paused" } : s));
      } else {
        await resumeSession(session.id);
        setSession((s) => (s ? { ...s, status: "active" } : s));
      }
    } finally {
      setLoading(false);
    }
  }

  /** Initiates the stop flow: shows the notes modal if daemon is online, else stops directly. */
  async function handleStopRequest() {
    if (!session || loading) return;
    setLoading(true);
    if (daemonOnline) {
      try {
        const resp = await fetch(`${DAEMON_URL}/directories`);
        const dirs = (await resp.json()) as WatchedDir[];
        setWatchedDirs(dirs);
      } catch {
        setWatchedDirs([]);
      }
      setShowNotesModal(true);
      setLoading(false);
    } else {
      await handleStopConfirm({});
    }
  }

  /** Completes the stop after the user submits (or skips) the notes modal. */
  async function handleStopConfirm(notes: Record<string, string>) {
    if (!session) return;
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    setShowNotesModal(false);
    setLoading(true);
    const sessionId = session.id;
    try {
      await stopSession(sessionId);
      setSession(null);

      if (daemonOnline) {
        try {
          const resp = await fetch(`${DAEMON_URL}/session/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, dir_notes: notes }),
          });
          const data = (await resp.json()) as { results?: unknown[] };
          const results = data.results ?? [];
          if (results.length > 0) {
            // Set sessionId before drafts — React 18 batches both state updates
            // ensuring stoppedSessionId is never "" when daemonDrafts.length > 0
            onStopSessionId(sessionId);
            setDaemonDrafts(results);
          } else {
            triggerGenerateReport(sessionId).catch((e: unknown) => {
              console.error("Erro ao gerar relatório:", e);
            });
          }
        } catch {
          // daemon unavailable — fall through to screenshot-based generation
          triggerGenerateReport(sessionId).catch((e: unknown) => {
            console.error("Erro ao gerar relatório:", e);
          });
        }
      } else {
        triggerGenerateReport(sessionId).catch((e: unknown) => {
          console.error("Erro ao gerar relatório:", e);
        });
      }
    } finally {
      setLoading(false);
      isStoppingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!session || loading) return;
    setLoading(true);
    try {
      await deleteSession(session.id);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showNotesModal && (
        <NotesModal
          dirs={watchedDirs}
          onConfirm={handleStopConfirm}
          onCancel={() => {
            setShowNotesModal(false);
            setLoading(false);
          }}
        />
      )}
      <div className="flex items-center gap-3">
        {isActive && (
          <span className="font-mono text-xs text-muted-foreground">
            {status === "active" ? (
              <>
                <span className="text-copper">●</span> gravando...
              </>
            ) : (
              <>
                <span>⏸</span> pausado
              </>
            )}
          </span>
        )}
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
          {!isActive && (
            <button
              onClick={handlePlay}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded text-copper hover:bg-copper-soft disabled:opacity-40"
              aria-label="Iniciar gravação"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
          {isActive && (
            <>
              <button
                onClick={handlePauseResume}
                disabled={loading}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                aria-label={status === "active" ? "Pausar" : "Retomar"}
              >
                {status === "active" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                aria-label="Excluir sessão"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleStopRequest}
                disabled={loading}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                aria-label="Finalizar"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Heatmap({ activeDays, streak }: { activeDays: string[]; streak: number }) {
  const now = new Date();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
  }).format(now);

  const activeDayNumbers = new Set(activeDays.map((d) => parseInt(d.split("-")[2], 10)));
  const days = Array.from({ length: totalDays }, (_, i) => ({
    day: i + 1,
    active: activeDayNumbers.has(i + 1),
  }));

  return (
    <div>
      <p className="section-label mb-3">{monthLabel} · Frequência</p>
      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
        {days.map((d) => (
          <div
            key={d.day}
            title={`Dia ${d.day}`}
            className={`aspect-square rounded-sm ${d.active ? "bg-copper" : "bg-border"}`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {activeDays.length} {activeDays.length === 1 ? "dia" : "dias"} com apontamento
        </span>
        <span className="font-mono">{streak} seguidos</span>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data, fullName, userId, orgId } = Route.useLoaderData();
  const firstName = fullName.split(" ")[0];
  const [daemonDrafts, setDaemonDrafts] = useState<unknown[]>([]);
  const [stoppedSessionId, setStoppedSessionId] = useState<string>("");

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? `Bom dia, ${firstName}`
      : hour < 18
        ? `Boa tarde, ${firstName}`
        : `Boa noite, ${firstName}`;

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <div className="bg-background">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{dateLabel}</p>
        </div>
        <Recorder setDaemonDrafts={setDaemonDrafts} onStopSessionId={setStoppedSessionId} />
      </div>
      {daemonDrafts.length > 0 && (
        <DaemonDraftReview
          sessionId={stoppedSessionId}
          drafts={daemonDrafts}
          orgId={orgId}
          userId={userId}
          onComplete={() => setDaemonDrafts([])}
        />
      )}

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 rounded-lg border border-border bg-surface p-6 md:col-span-5">
          <Heatmap activeDays={data.activeDays} streak={data.streak} />
        </section>

        <section className="col-span-12 grid grid-cols-2 gap-4 md:col-span-7">
          <StatCard
            label="Horas no mês"
            value={formatHours(data.horasNoMes)}
            sub={`${data.apontamentosNoMes} apontamento(s)`}
            tone="copper"
          />
          <StatCard
            label="Apontamentos"
            value={String(data.apontamentosNoMes)}
            sub={`${data.activeDays.length} dia(s) ativo(s)`}
            tone="copper"
          />
          <StatCard
            label="Tarefas concluídas"
            value={String(data.tarefasConcluidas)}
            sub="concluídas no total"
            tone="teal"
          />
          <StatCard
            label="Projetos ativos"
            value={String(data.projetosAtivos)}
            sub="com tarefas abertas"
            tone="teal"
          />
        </section>

        <section className="col-span-12 md:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <p className="section-label">Apontamentos recentes</p>
            <Link
              to="/apontamentos"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver todos →
            </Link>
          </div>
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
            <div className="space-y-3">
              {data.recentApontamentos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum apontamento registrado
                </div>
              ) : (
                data.recentApontamentos.map((r) => (
                  <Link
                    key={r.id}
                    to="/apontamentos"
                    className="relative block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-copper/40"
                  >
                    <span className="absolute -left-[18px] top-5 h-2 w-2 rounded-full bg-copper ring-4 ring-background" />
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-copper">
                        {formatDate(r.date)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.preview}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.done > 0 && <Chip color="success">{r.done} concluída(s)</Chip>}
                      {r.doing > 0 && <Chip color="copper">{r.doing} em andamento</Chip>}
                      {r.done === 0 && r.doing === 0 && (
                        <Chip color="teal">sem tarefas vinculadas</Chip>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="col-span-12 space-y-8 md:col-span-5">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Minhas tarefas prioritárias</p>
              <Link to="/tarefas" className="text-xs text-muted-foreground hover:text-foreground">
                Ver todas →
              </Link>
            </div>
            <div className="space-y-2">
              {data.priorityTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma tarefa prioritária
                </div>
              ) : (
                data.priorityTasks.map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground" />
                    <p className="flex-1 truncate text-sm">{t.title}</p>
                    {t.due_date && (
                      <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-copper">
                        {formatDue(t.due_date)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Org · Prazos próximos</p>
              <Link
                to="/tarefas-org"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver →
              </Link>
            </div>
            <div className="space-y-2">
              {data.orgDeadlines.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum prazo próximo
                </div>
              ) : (
                data.orgDeadlines.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs text-teal">{t.project}</p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        t.days < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {t.days < 0 ? `${Math.abs(t.days)}d atrasada` : `${t.days}d`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "copper" | "teal";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="section-label">{label}</p>
      <p
        className={`mt-3 text-3xl font-semibold tracking-tight ${
          tone === "copper" ? "text-copper" : "text-teal"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Chip({
  color,
  children,
}: {
  color: "copper" | "teal" | "success";
  children: React.ReactNode;
}) {
  const cls =
    color === "copper"
      ? "bg-copper-soft text-copper"
      : color === "teal"
        ? "bg-teal-soft text-teal"
        : "bg-[#10B98119] text-[#10B981]";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

function formatHours(h: number): string {
  if (h === 0) return "0h";
  const rounded = Math.round(h * 4) / 4;
  return `${rounded.toLocaleString("pt-BR")}h`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function formatDue(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

// Needed to avoid unused import warning for DashboardData
type _DashboardData = DashboardData;
