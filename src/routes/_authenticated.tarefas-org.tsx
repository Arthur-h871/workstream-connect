import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getProjects,
  createProject,
  closeProject,
  type Project,
} from "backend/api/services/projects.service";

export const Route = createFileRoute("/_authenticated/tarefas-org")({
  head: () => ({
    meta: [
      { title: "Tarefas da Organização — Marco" },
      {
        name: "description",
        content: "Projetos e tarefas da sua organização.",
      },
    ],
  }),
  loader: async ({ context }) => {
    const projects = await getProjects(context.profile.organization_id);
    return {
      projects,
      orgId: context.profile.organization_id,
      userId: context.profile.id,
      isAdmin: context.profile.role !== "tenant_user",
    };
  },
  component: () => (
    <AppShell title="Tarefas da Organização">
      <TarefasOrg />
    </AppShell>
  ),
});

function TarefasOrg() {
  const { projects: initial, orgId, userId, isAdmin } = Route.useLoaderData();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>(initial);
  const [showModal, setShowModal] = useState(false);

  async function handleCreate(fields: {
    name: string;
    description: string;
    color: string;
    due_date: string;
  }) {
    const created = await createProject({
      orgId,
      createdBy: userId,
      name: fields.name,
      description: fields.description || null,
      color: fields.color,
      due_date: fields.due_date || null,
    });
    if (created) setProjects((prev) => [created, ...prev]);
    setShowModal(false);
  }

  async function handleClose(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    await closeProject(id);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Arraste tarefas entre projetos para realocar.
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo projeto
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
          Nenhum projeto criado
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              isAdmin={isAdmin}
              onClick={() =>
                navigate({
                  to: "/tarefas-org/$projectId",
                  params: { projectId: p.id },
                })
              }
              onClose={handleClose}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateProjectModal onConfirm={handleCreate} onCancel={() => setShowModal(false)} />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  isAdmin,
  onClick,
  onClose,
}: {
  project: Project;
  isAdmin: boolean;
  onClick: () => void;
  onClose: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-muted-foreground/30">
      <div className="h-1" style={{ backgroundColor: project.color }} />
      <button onClick={onClick} className="w-full p-5 text-left">
        <h3 className="mb-4 text-base font-semibold">{project.name}</h3>
        <p className="mt-4 font-mono text-[10px] text-muted-foreground">
          {project.task_count} TAREFAS
        </p>
      </button>
      {isAdmin && (
        <div className="absolute right-2 top-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
            aria-label="Opções do projeto"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-36 rounded-md border border-border bg-surface py-1 shadow-lg">
                <button
                  onClick={() => {
                    onClose(project.id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  Fechar projeto
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const COLOR_PRESETS = ["#14B8A6", "#EA580C", "#6366F1", "#EC4899", "#F59E0B", "#10B981"];

function CreateProjectModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (fields: {
    name: string;
    description: string;
    color: string;
    due_date: string;
  }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: COLOR_PRESETS[0],
    due_date: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">Novo projeto</h2>
        <div className="space-y-4">
          <div>
            <p className="section-label mb-1.5">Nome *</p>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="Nome do projeto"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <p className="section-label mb-1.5">Descrição</p>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <p className="section-label mb-1.5">Cor</p>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => set("color")(c)}
                  aria-label={`Cor ${c}`}
                  className={`h-7 w-7 rounded-full transition-transform ${form.color === c ? "ring-2 ring-foreground ring-offset-2" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="section-label mb-1.5">Prazo</p>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => set("due_date")(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (form.name.trim()) onConfirm(form);
            }}
            disabled={!form.name.trim()}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
          >
            Criar
          </button>
        </div>
      </div>
    </>
  );
}
