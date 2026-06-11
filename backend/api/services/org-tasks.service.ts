import { supabase } from "backend/api/supabase";

export type OrgTask = {
  id: string;
  title: string;
  description: string | null;
  status: "queued" | "in_progress" | "completed";
  priority: number;
  due_date: string | null;
  note: string | null;
  assigned_to: string | null;
  created_at: string;
};

export type OrgTaskUpdate = Partial<
  Pick<OrgTask, "title" | "description" | "status" | "due_date" | "note" | "assigned_to">
>;

const TASK_SELECT =
  "id, title, description, status, priority, due_date, note, assigned_to, created_at";

export async function getOrgTasks(projectId: string): Promise<OrgTask[]> {
  const { data, error } = await supabase
    .from("org_tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .order("priority", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function getMyOrgTasks(userId: string): Promise<OrgTask[]> {
  const { data, error } = await supabase
    .from("org_tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", userId)
    .neq("status", "completed")
    .order("priority", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function createOrgTask(data: {
  projectId: string;
  orgId: string;
  createdBy: string;
  title: string;
}): Promise<OrgTask | null> {
  const { data: row, error } = await supabase
    .from("org_tasks")
    .insert({
      project_id: data.projectId,
      organization_id: data.orgId,
      created_by: data.createdBy,
      title: data.title,
    })
    .select(TASK_SELECT)
    .single();

  if (error || !row) return null;
  return row;
}

export async function updateOrgTask(id: string, fields: OrgTaskUpdate): Promise<void> {
  await supabase.from("org_tasks").update(fields).eq("id", id);
}

export async function deleteOrgTask(id: string): Promise<void> {
  await supabase.from("org_tasks").delete().eq("id", id);
}
