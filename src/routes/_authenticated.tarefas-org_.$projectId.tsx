import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { getProject } from "backend/api/services/projects.service";
import {
  getOrgTasks,
  createOrgTask,
  updateOrgTask,
  deleteOrgTask,
  type OrgTask,
} from "backend/api/services/org-tasks.service";
import { getOrgMembers, type OrgMember } from "backend/api/services/users.service";

export const Route = createFileRoute("/_authenticated/tarefas-org_/$projectId")({
  loader: async ({ params, context }) => {
    const [project, tasks, members] = await Promise.all([
      getProject(params.projectId),
      getOrgTasks(params.projectId),
      getOrgMembers(context.profile.organization_id),
    ]);
    if (!project) throw redirect({ to: "/tarefas-org" });
    return {
      project,
      tasks,
      members,
      orgId: context.profile.organization_id,
      userId: context.profile.id,
      isAdmin: context.profile.role !== "tenant_user",
    };
  },
  component: ProjectPage,
});

function ProjectPage() {
  const { project, tasks, members, orgId, userId, isAdmin } = Route.useLoaderData();
  return (
    <AppShell title="Tarefas da Organização">
      <ProjectView
        project={project}
        initialTasks={tasks}
        members={members}
        orgId={orgId}
        userId={userId}
        isAdmin={isAdmin}
      />
    </AppShell>
  );
}

function ProjectView({
  project,
  initialTasks,
  members,
  orgId,
  userId,
  isAdmin,
}: {
  project: { id: string; name: string; color: string };
  initialTasks: OrgTask[];
  members: OrgMember[];
  orgId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const [tasks, setTasks] = useState<OrgTask[]>(initialTasks);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function handleUpdate(id: string, fields: Partial<OrgTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
  }

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    const task = await createOrgTask({
      projectId: project.id,
      orgId,
      createdBy: userId,
      title,
    });
    if (task) setTasks((prev) => [...prev, task]);
    setNewTitle("");
    setCreating(false);
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    deleteOrgTask(id);
  }

  return (
    <div>
      <Link
        to="/tarefas-org"
        className="mb-4 inline-block text-xs text-muted-foreground hover:text-foreground"
      >
        ← Voltar para projetos
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
          <h2 className="text-2xl font-semibold">{project.name}</h2>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova tarefa
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-2 overflow-hidden rounded-lg border border-teal bg-surface">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewTitle("");
              }
            }}
            placeholder="Título da tarefa…"
            className="w-full bg-transparent px-4 py-3 text-sm focus:outline-none"
          />
        </div>
      )}

      {tasks.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa neste projeto
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              members={members}
              isAdmin={isAdmin}
              isOpen={expanded === task.id}
              onToggle={() => setExpanded((prev) => (prev === task.id ? null : task.id))}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<OrgTask["status"], string> = {
  queued: "Na fila",
  in_progress: "Em progresso",
  completed: "Concluída",
};

function TaskRow({
  task,
  members,
  isAdmin,
  isOpen,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: OrgTask;
  members: OrgMember[];
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate: (id: string, fields: Partial<OrgTask>) => void;
  onDelete: (id: string) => void;
}) {
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDescChange(value: string) {
    onUpdate(task.id, { description: value });
    if (descDebounce.current) clearTimeout(descDebounce.current);
    descDebounce.current = setTimeout(() => updateOrgTask(task.id, { description: value }), 800);
  }

  function handleNoteChange(value: string) {
    onUpdate(task.id, { note: value });
    if (noteDebounce.current) clearTimeout(noteDebounce.current);
    noteDebounce.current = setTimeout(() => updateOrgTask(task.id, { note: value }), 800);
  }

  function handleStatusChange(status: OrgTask["status"]) {
    onUpdate(task.id, { status });
    updateOrgTask(task.id, { status });
  }

  function handleAssignedChange(value: string) {
    const assigned_to = value || null;
    onUpdate(task.id, { assigned_to });
    updateOrgTask(task.id, { assigned_to });
  }

  function handleDueDateChange(value: string) {
    const due_date = value || null;
    onUpdate(task.id, { due_date });
    updateOrgTask(task.id, { due_date });
  }

  const done = task.status === "completed";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
          >
            {task.title}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              done
                ? "bg-[#10B98119] text-[#10B981]"
                : task.status === "in_progress"
                  ? "bg-copper-soft text-copper"
                  : "bg-border text-muted-foreground"
            }`}
          >
            {STATUS_LABELS[task.status]}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-border px-5 py-5">
          {isAdmin && (
            <Section label="Descrição">
              <textarea
                rows={2}
                defaultValue={task.description ?? ""}
                onChange={(e) => handleDescChange(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
            </Section>
          )}

          <Section label="Status">
            <SegmentedStatus value={task.status} onChange={handleStatusChange} />
          </Section>

          {isAdmin && (
            <div className="grid grid-cols-2 gap-5">
              <Section label="Responsável">
                <select
                  value={task.assigned_to ?? ""}
                  onChange={(e) => handleAssignedChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
                >
                  <option value="">Selecionar…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </Section>
              <Section label="Prazo">
                <input
                  type="date"
                  value={task.due_date ?? ""}
                  onChange={(e) => handleDueDateChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
                />
              </Section>
            </div>
          )}

          <Section label="Nota">
            <textarea
              rows={3}
              defaultValue={task.note ?? ""}
              onChange={(e) => handleNoteChange(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
          </Section>

          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => onDelete(task.id)}
                className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" /> Excluir tarefa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTS: { label: string; status: OrgTask["status"] }[] = [
  { label: "Na fila", status: "queued" },
  { label: "Em progresso", status: "in_progress" },
  { label: "Concluída", status: "completed" },
];

function SegmentedStatus({
  value,
  onChange,
}: {
  value: OrgTask["status"];
  onChange: (status: OrgTask["status"]) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {STATUS_OPTS.map((o) => (
        <button
          key={o.status}
          onClick={() => onChange(o.status)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.status
              ? o.status === "completed"
                ? "bg-[#10B98119] text-[#10B981]"
                : "bg-teal-soft text-teal"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
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
