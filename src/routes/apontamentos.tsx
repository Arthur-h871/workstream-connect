import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Filter, Circle, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/apontamentos")({
  head: () => ({ meta: [{ title: "Apontamentos — Marco" }, { name: "description", content: "Visualize e gerencie seus apontamentos diários." }] }),
  component: () => (
    <AppShell>
      <Apontamentos />
    </AppShell>
  ),
});

const items = [
  { id: "a1", date: "Hoje", time: "5h 30m", content: "Refatorei o módulo de autenticação para suportar OAuth e adicionei testes de integração. Revisei o PR de Ana sobre o novo fluxo de onboarding e deixei comentários sobre validação de payloads no webhook.\n\nDepois alinhei com o time de produto sobre os próximos passos da migração do banco de staging — fechamos um plano em duas fases para reduzir downtime.", tasks: [{ name: "Refatorar autenticação OAuth", done: true }, { name: "Revisar PR #482", done: true }, { name: "Documentar webhook v2", done: false }] },
  { id: "a2", date: "Ontem", time: "6h 12m", content: "Investigação de bug no pipeline de billing. Identifiquei race condition no webhook do Stripe.", tasks: [{ name: "Bug billing pipeline", done: true }, { name: "Postmortem race condition", done: false }] },
  { id: "a3", date: "06 Jun", time: "4h 45m", content: "Reunião de planning Q3.", tasks: [{ name: "Planning Q3", done: true }] },
  { id: "a4", date: "05 Jun", time: "7h 02m", content: "Setup do ambiente de staging.", tasks: [] },
  { id: "a5", date: "04 Jun", time: "3h 18m", content: "Pair programming com Ana sobre componentes de design system.", tasks: [{ name: "Design system tokens", done: true }] },
];

function Apontamentos() {
  const [selected, setSelected] = useState(items[0].id);
  const [showModal, setShowModal] = useState(false);
  const current = items.find((i) => i.id === selected)!;

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-0px)] bg-background">
      {/* Left panel */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h1 className="text-base font-semibold">Apontamentos</h1>
          <button className="flex h-7 w-7 items-center justify-center rounded-md bg-copper text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="relative pl-5">
            <div className="absolute bottom-2 left-1.5 top-2 w-px bg-border" />
            <div className="space-y-2">
              {items.map((it) => {
                const active = it.id === selected;
                return (
                  <button
                    key={it.id}
                    onClick={() => setSelected(it.id)}
                    className={`relative block w-full rounded-md p-3 text-left transition-colors ${
                      active ? "border-l-2 border-copper bg-surface pl-[10px]" : "hover:bg-surface"
                    }`}
                  >
                    <span className={`absolute -left-[14px] top-4 h-2 w-2 rounded-full ring-4 ring-background ${active ? "bg-copper" : "bg-border"}`} />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-copper">{it.date}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{it.time}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.content}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <div className="relative flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-12 gap-5">
          {/* Main card */}
          <article className="col-span-12 rounded-lg border border-border bg-surface p-7 lg:col-span-8">
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">JS</div>
                <div>
                  <p className="text-sm font-medium">João Silva</p>
                  <p className="font-mono text-xs text-muted-foreground">{current.date} · {current.time}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-foreground">
              {current.content.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <p className="section-label mb-3">Prints capturados · 51</p>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-video cursor-pointer rounded border border-border bg-background transition-colors hover:border-copper"
                    style={{ backgroundImage: `linear-gradient(135deg, #1C1917 25%, #252220 25%, #252220 50%, #1C1917 50%, #1C1917 75%, #252220 75%)`, backgroundSize: "8px 8px" }}
                  />
                ))}
              </div>
            </div>
          </article>

          {/* Tasks card */}
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
              {current.tasks.length === 0 && (
                <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma tarefa vinculada
                </li>
              )}
              {current.tasks.map((t, i) => (
                <li key={i}>
                  <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-background">
                    {t.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#10B981] text-background" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-copper" strokeWidth={2.5} />
                    )}
                    <span className={`text-sm ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {/* Add task modal */}
      {showModal && <AddTaskModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function AddTaskModal({ onClose }: { onClose: () => void }) {
  const orgTasks = [
    { name: "Auditoria de segurança trimestral", project: "Compliance" },
    { name: "Refatorar fluxo de checkout", project: "Billing" },
    { name: "Implementar webhooks v2", project: "Platform" },
    { name: "Migrar banco de staging", project: "Platform" },
    { name: "Atualizar SDK Node", project: "DevEx" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Adicionar tarefas</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Buscar tarefa..."
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-copper focus:outline-none"
              />
            </div>
            <button className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground hover:text-foreground">
              <Filter className="h-3.5 w-3.5" /> Filtrar
            </button>
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {orgTasks.map((t, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-background">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-copper" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{t.name}</p>
                    <p className="text-xs text-teal">{t.project}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button className="rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
