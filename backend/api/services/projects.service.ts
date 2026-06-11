import { supabase } from "backend/api/supabase";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: "active" | "closed";
  due_date: string | null;
  task_count: number;
  created_at: string;
};

export async function getProjects(orgId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, color, status, due_date, created_at, org_tasks(count)")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    status: p.status,
    due_date: p.due_date,
    task_count: (p.org_tasks as { count: number }[])[0]?.count ?? 0,
    created_at: p.created_at,
  }));
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, color, status, due_date, created_at, org_tasks(count)")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    color: data.color,
    status: data.status,
    due_date: data.due_date,
    task_count: (data.org_tasks as { count: number }[])[0]?.count ?? 0,
    created_at: data.created_at,
  };
}

export async function createProject(data: {
  orgId: string;
  createdBy: string;
  name: string;
  description: string | null;
  color: string;
  due_date: string | null;
}): Promise<Project | null> {
  const { data: row, error } = await supabase
    .from("projects")
    .insert({
      organization_id: data.orgId,
      created_by: data.createdBy,
      name: data.name,
      description: data.description,
      color: data.color,
      due_date: data.due_date,
    })
    .select("id, name, description, color, status, due_date, created_at")
    .single();

  if (error || !row) return null;

  return { ...row, task_count: 0 };
}

export async function closeProject(id: string): Promise<void> {
  await supabase.from("projects").update({ status: "closed" }).eq("id", id);
}
