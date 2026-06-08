import { createFileRoute } from "@tanstack/react-router";
import { Plus, GripVertical, ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/tarefas")({
  head: () => ({ meta: [{ title: "Minhas Tarefas — Marco" }, { name: "description", content: "Suas tarefas pessoais." }] }),
  component: () => (
    <AppShell title="Minhas Tarefas">
      <Tarefas />
    </AppShell>
  ),
});

const initial = [
  { id: "1", title: "Revisar PR #482 — autenticação OAuth", due: "Hoje", status: "Em progresso" },
  { id: "2", title: "Atualizar documentação do SDK", due: "Amanhã", status: "Na fila" },
  { id: "3", title: "Sincronizar com design sobre nova home", due: "Sex", status: "Na fila" },
  { id: "4", title: "Planejar migração do banco de staging", due: null, status: "Na fila" },
  { id: "5", title: "Limpar issues antigas do repo", due: null, status: "Concluída" },
];

function Tarefas() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="relative">
      <p className="mb-6 text-sm text-muted-foreground">Arraste para reordenar por prioridade.</p>

      <div className="space-y-2">
        {initial.map((t) => {
          const isOpen = expanded === t.id;
          const done = t.status === "Concluída";
          return (
            <div key={t.id} className="group overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 px-3 py-3">
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground" />
                <button onClick={() => setExpanded(isOpen ? null : t.id)} className="flex flex-1 items-center gap-3 text-left">
                  <span className={`text-sm ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                </button>
                {t.due && (
                  <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-copper">
                    {t.due}
                  </span>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  done ? "bg-[#10B98119] text-[#10B981]" : t.status === "Em progresso" ? "bg-copper-soft text-copper" : "bg-border text-muted-foreground"
                }`}>
                  {t.status}
                </span>
                <button onClick={() => setExpanded(isOpen ? null : t.id)}>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {isOpen && (
                <div className="space-y-4 border-t border-border px-5 py-4">
                  <div>
                    <p className="section-label mb-2">Descrição</p>
                    <textarea
                      rows={3}
                      defaultValue="Adicionar descrição da tarefa..."
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Sem dependências</p>
                    <button className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
                      <Trash2 className="h-3 w-3" /> Excluir tarefa
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="fixed bottom-8 right-8 flex h-12 w-12 items-center justify-center rounded-full bg-copper text-primary-foreground shadow-lg hover:opacity-90">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
