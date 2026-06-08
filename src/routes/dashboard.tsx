import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Pause, Square, Trash2, GripVertical } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Marco" }, { name: "description", content: "Resumo do seu trabalho, tarefas e produtividade." }] }),
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

const recordings = [
  { date: "Hoje", preview: "Refatorei o módulo de autenticação para suportar OAuth e adicionei testes de integração. Revisei o PR de Ana sobre o novo fluxo de onboarding.", done: 3, doing: 2 },
  { date: "Ontem", preview: "Investigação de bug no pipeline de billing. Identifiquei race condition no webhook do Stripe e propus correção.", done: 2, doing: 1 },
  { date: "06 Jun", preview: "Reunião de planning Q3. Quebrei épicos em tarefas estimáveis e atribuí responsáveis para a primeira sprint.", done: 4, doing: 0 },
];

const priorityTasks = [
  { id: "t1", title: "Revisar PR #482 — autenticação OAuth", due: "Hoje" },
  { id: "t2", title: "Atualizar documentação do SDK", due: "Amanhã" },
  { id: "t3", title: "Sincronizar com design sobre nova home", due: "Sex" },
  { id: "t4", title: "Planejar migração do banco de staging", due: null },
];

const orgTasks = [
  { title: "Auditoria de segurança trimestral", project: "Compliance", days: -1 },
  { title: "Refatorar fluxo de checkout", project: "Billing", days: 2 },
  { title: "Implementar webhooks v2", project: "Platform", days: 5 },
];

function Recorder() {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const isActive = state !== "idle";

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <span className="font-mono text-xs text-muted-foreground">
          <span className="text-copper">●</span> 00:42:15 · 51 prints
        </span>
      )}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
        {state === "idle" && (
          <button
            onClick={() => setState("recording")}
            className="flex h-7 w-7 items-center justify-center rounded text-copper hover:bg-copper-soft"
            aria-label="Iniciar gravação"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={() => setState(state === "paused" ? "recording" : "paused")}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Pausar"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setState("idle")}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Excluir sessão"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setState("idle")}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Finalizar"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Heatmap() {
  // 30 days, semi-random binary
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    active: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 15, 16, 17, 19, 20, 22, 23, 24, 26, 27].includes(i),
  }));
  return (
    <div>
      <p className="section-label mb-3">Junho · Frequência</p>
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
        <span>21 dias com apontamento</span>
        <span className="font-mono">🔥 7 seguidos</span>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="bg-background">
      {/* Header row */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bom dia, João</h1>
          <p className="mt-1 text-sm text-muted-foreground">Segunda, 8 de junho</p>
        </div>
        <Recorder />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Heatmap */}
        <section className="col-span-12 rounded-lg border border-border bg-surface p-6 md:col-span-5">
          <Heatmap />
        </section>

        {/* Stats */}
        <section className="col-span-12 grid grid-cols-2 gap-4 md:col-span-7">
          <StatCard label="Horas no mês" value="142h" sub="+12h vs semana passada" tone="copper" />
          <StatCard label="Apontamentos" value="21" sub="esta semana: 5" tone="copper" />
          <StatCard label="Tarefas concluídas" value="34" sub="meta mensal: 40" tone="teal" />
          <StatCard label="Projetos ativos" value="6" sub="2 com prazo próximo" tone="teal" />
        </section>

        {/* Recent recordings */}
        <section className="col-span-12 md:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <p className="section-label">Apontamentos recentes</p>
            <Link to="/apontamentos" className="text-xs text-muted-foreground hover:text-foreground">
              Ver todos →
            </Link>
          </div>
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
            <div className="space-y-3">
              {recordings.map((r, i) => (
                <Link
                  key={i}
                  to="/apontamentos"
                  className="relative block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-copper/40"
                >
                  <span className="absolute -left-[18px] top-5 h-2 w-2 rounded-full bg-copper ring-4 ring-background" />
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-copper">{r.date}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{r.preview}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip color="success">{r.done} concluídas</Chip>
                    {r.doing > 0 && <Chip color="copper">{r.doing} em andamento</Chip>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Sidebar tasks */}
        <section className="col-span-12 space-y-8 md:col-span-5">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Minhas tarefas prioritárias</p>
              <Link to="/tarefas" className="text-xs text-muted-foreground hover:text-foreground">
                Ver todas →
              </Link>
            </div>
            <div className="space-y-2">
              {priorityTasks.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground" />
                  <p className="flex-1 truncate text-sm">{t.title}</p>
                  {t.due && (
                    <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-copper">
                      {t.due}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="section-label">Org · Prazos próximos</p>
              <Link to="/tarefas-org" className="text-xs text-muted-foreground hover:text-foreground">
                Ver →
              </Link>
            </div>
            <div className="space-y-2">
              {orgTasks.map((t, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
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
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "copper" | "teal" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="section-label">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${tone === "copper" ? "text-copper" : "text-teal"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Chip({ color, children }: { color: "copper" | "teal" | "success"; children: React.ReactNode }) {
  const cls =
    color === "copper"
      ? "bg-copper-soft text-copper"
      : color === "teal"
      ? "bg-teal-soft text-teal"
      : "bg-[#10B98119] text-[#10B981]";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

