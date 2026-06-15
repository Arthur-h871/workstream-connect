import { supabase } from "backend/api/supabase";
import { updatePersonalTask } from "backend/api/services/tarefas.service";
import { updateOrgTask } from "backend/api/services/org-tasks.service";

export type LinkedTask = {
  link_id: string;
  task_id: string;
  title: string;
  status: "started" | "concluded";
  type: "personal" | "org";
};

export type Apontamento = {
  id: string;
  date: string;
  content: string;
  hours_worked: number;
  created_at: string;
  session_id: string | null;
  linked_tasks: LinkedTask[];
  screenshot_count: number;
};

const SELECT = `
  id, date, content, hours_worked, created_at, session_id,
  capture_sessions ( screenshot_count ),
  apontamento_personal_tasks (
    id, status,
    personal_tasks ( id, title )
  ),
  apontamento_org_tasks (
    id, status,
    org_tasks ( id, title )
  )
`.trim();

function mapRow(row: any): Apontamento {
  const personalLinks: LinkedTask[] = (row.apontamento_personal_tasks ?? []).map((l: any) => ({
    link_id: l.id,
    task_id: l.personal_tasks?.id ?? "",
    title: l.personal_tasks?.title ?? "",
    status: l.status as "started" | "concluded",
    type: "personal" as const,
  }));
  const orgLinks: LinkedTask[] = (row.apontamento_org_tasks ?? []).map((l: any) => ({
    link_id: l.id,
    task_id: l.org_tasks?.id ?? "",
    title: l.org_tasks?.title ?? "",
    status: l.status as "started" | "concluded",
    type: "org" as const,
  }));
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    hours_worked: Number(row.hours_worked),
    created_at: row.created_at,
    session_id: row.session_id,
    linked_tasks: [...personalLinks, ...orgLinks],
    screenshot_count: row.capture_sessions?.screenshot_count ?? 0,
  };
}

export async function getApontamentos(userId: string): Promise<Apontamento[]> {
  const { data, error } = await supabase
    .from("apontamentos")
    .select(SELECT)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map(mapRow);
}

export async function createApontamento(
  userId: string,
  orgId: string,
): Promise<Apontamento | null> {
  const { data, error } = await supabase
    .from("apontamentos")
    .insert({ user_id: userId, organization_id: orgId })
    .select(SELECT)
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

export async function updateApontamento(
  id: string,
  fields: Partial<Pick<Apontamento, "content" | "hours_worked" | "date">>,
): Promise<void> {
  await supabase.from("apontamentos").update(fields).eq("id", id);
}

export async function deleteApontamento(id: string): Promise<void> {
  await supabase.from("apontamentos").delete().eq("id", id);
}

export async function linkPersonalTask(
  apontamentoId: string,
  taskId: string,
): Promise<LinkedTask | null> {
  const { data, error } = await supabase
    .from("apontamento_personal_tasks")
    .insert({ apontamento_id: apontamentoId, personal_task_id: taskId })
    .select("id, status, personal_tasks ( id, title )")
    .single();

  if (error || !data) return null;
  return {
    link_id: data.id,
    task_id: (data.personal_tasks as any)?.id ?? "",
    title: (data.personal_tasks as any)?.title ?? "",
    status: data.status as "started" | "concluded",
    type: "personal",
  };
}

export async function linkOrgTask(
  apontamentoId: string,
  taskId: string,
): Promise<LinkedTask | null> {
  const { data, error } = await supabase
    .from("apontamento_org_tasks")
    .insert({ apontamento_id: apontamentoId, org_task_id: taskId })
    .select("id, status, org_tasks ( id, title )")
    .single();

  if (error || !data) return null;
  return {
    link_id: data.id,
    task_id: (data.org_tasks as any)?.id ?? "",
    title: (data.org_tasks as any)?.title ?? "",
    status: data.status as "started" | "concluded",
    type: "org",
  };
}

export async function updateLinkedTaskStatus(
  linkId: string,
  type: "personal" | "org",
  status: "started" | "concluded",
  taskId: string,
): Promise<void> {
  const table = type === "personal" ? "apontamento_personal_tasks" : "apontamento_org_tasks";
  await supabase.from(table).update({ status }).eq("id", linkId);

  const taskStatus = status === "concluded" ? "completed" : "in_progress";
  if (type === "personal") {
    await updatePersonalTask(taskId, { status: taskStatus });
  } else {
    await updateOrgTask(taskId, { status: taskStatus });
  }
}

export async function unlinkTask(linkId: string, type: "personal" | "org"): Promise<void> {
  const table = type === "personal" ? "apontamento_personal_tasks" : "apontamento_org_tasks";
  await supabase.from(table).delete().eq("id", linkId);
}
