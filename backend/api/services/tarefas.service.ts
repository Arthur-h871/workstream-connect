import { supabase } from "backend/api/supabase";

export type PersonalTask = {
  id: string;
  title: string;
  description: string | null;
  status: "queued" | "in_progress" | "completed";
  priority: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export async function getPersonalTasks(userId: string): Promise<PersonalTask[]> {
  const { data, error } = await supabase
    .from("personal_tasks")
    .select("id, title, description, status, priority, due_date, created_at, updated_at")
    .eq("user_id", userId)
    .order("priority", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function createPersonalTask(
  userId: string,
  title: string,
): Promise<PersonalTask | null> {
  const { data: last } = await supabase
    .from("personal_tasks")
    .select("priority")
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .limit(1);

  const nextPriority = last && last.length > 0 ? last[0].priority + 1 : 0;

  const { data, error } = await supabase
    .from("personal_tasks")
    .insert({ user_id: userId, title, priority: nextPriority })
    .select("id, title, description, status, priority, due_date, created_at, updated_at")
    .single();

  if (error) return null;
  return data;
}

export async function updatePersonalTask(
  id: string,
  fields: Partial<Pick<PersonalTask, "title" | "description" | "status" | "due_date">>,
): Promise<void> {
  await supabase.from("personal_tasks").update(fields).eq("id", id);
}

export async function reorderPersonalTasks(
  updates: { id: string; priority: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, priority }) =>
      supabase.from("personal_tasks").update({ priority }).eq("id", id),
    ),
  );
}

export async function deletePersonalTask(id: string): Promise<void> {
  await supabase.from("personal_tasks").delete().eq("id", id);
}
