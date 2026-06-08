import { createFileRoute } from "@tanstack/react-router";
import { Plus, ChevronDown } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/tarefas-org")({
  head: () => ({ meta: [{ title: "Tarefas da Organização — Marco" }, { name: "description", content: "Projetos e tarefas da sua organização." }] }),
  component: () => (
    <AppShell title="Tarefas da Organização">
      <TarefasOrg />
    </AppShell>
  ),
});

const projects = [
  { id: "p1", name: "Platform", color: "#14B8A6", tasks: ["Implementar webhooks v2", "Migrar banco de staging", "Refatorar autenticação OAuth", "Setup de observability"] },
  { id: "p2", name: "Billing", color: "#EA580C", tasks: ["Refatorar fluxo de checkout", "Bug billing pipeline", "Integrar Stripe Tax"] },
  { id: "p3", name: "Compliance", color: "#8B5CF6", tasks: ["Auditoria trimestral", "Revisão SOC2", "DPO meeting prep"] },
  { id: "p4", name: "DevEx", color: "#F59E0B", tasks: ["Atualizar SDK Node", "Documentação API v3"] },
  { id: "noproj", name: "Sem projeto", color: "#57534E", tasks: ["Atualizar onboarding deck", "Limpar issues antigas"] },
];

function TarefasOrg() {
  const [openProject, setOpenProject] = useState<string | null>(null);
  const project = openProject ? projects.find((p) => p.id === openProject) : null;

  if (project) {
    return <ProjectView project={project} onBack={() => setOpenProject(null)} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Arraste tarefas entre projetos para realocar.</p>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Novo projeto
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setOpenProject(p.id)}
            className="group overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-muted-foreground/30"
          >
            <div className="h-1" style={{ backgroundColor: p.color }} />
            <div className="p-5">
              <h3 className="mb-4 text-base font-semibold">{p.name}</h3>
              <ul className="space-y-1.5">
                {p.tasks.map((t, i) => (
                  <li key={i} className="truncate text-sm text-muted-foreground">
                    — {t}
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-mono text-[10px] text-muted-foreground">
                {p.tasks.length} TAREFAS
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectView({ project, onBack }: { project: (typeof projects)[number]; onBack: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-xs text-muted-foreground hover:text-foreground">
        ← Voltar para projetos
      </button>
      <div className="mb-8 flex items-center gap-3">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
        <h2 className="text-2xl font-semibold">{project.name}</h2>
      </div>

      <div className="space-y-2">
        {project.tasks.map((t, i) => {
          const isOpen = expanded === i;
          return (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-surface">
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium">{t}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-5 border-t border-border px-5 py-5">
                  <Section label="Descrição">
                    <p className="text-sm text-muted-foreground">
                      Implementar nova versão dos webhooks com suporte a retry exponencial, assinatura HMAC e fila de dead letters. Documentar no portal do desenvolvedor.
                    </p>
                  </Section>

                  <Section label="Status">
                    <SegmentedStatus />
                  </Section>

                  <div className="grid grid-cols-2 gap-5">
                    <Section label="Responsável">
                      <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none">
                        <option>João Silva</option>
                        <option>Ana Costa</option>
                        <option>Bruno Lima</option>
                      </select>
                    </Section>
                    <Section label="Prazo">
                      <input type="date" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none" defaultValue="2026-06-15" />
                    </Section>
                  </div>

                  <Section label="Dependências">
                    <div className="flex flex-wrap gap-1.5">
                      <DepChip>Refatorar autenticação OAuth</DepChip>
                      <DepChip>Setup de observability</DepChip>
                      <button className="rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">+ adicionar</button>
                    </div>
                  </Section>

                  <Section label="Nota">
                    <textarea
                      rows={3}
                      placeholder="Adicionar nota..."
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
                    />
                  </Section>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-2">{label}</p>
      {children}
    </div>
  );
}

function SegmentedStatus() {
  const opts = ["Na fila", "Em progresso", "Concluída"] as const;
  const [v, setV] = useState<(typeof opts)[number]>("Em progresso");
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => setV(o)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            v === o
              ? o === "Concluída"
                ? "bg-[#10B98119] text-[#10B981]"
                : "bg-teal-soft text-teal"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function DepChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-teal-soft px-2 py-1 text-xs text-teal">
      {children}
    </span>
  );
}
