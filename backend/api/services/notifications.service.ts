import { supabase } from "backend/api/supabase";

export type Notification = {
  id: string;
  user_id: string;
  type:
    | "new_org_task"
    | "task_assigned"
    | "member_request"
    | "member_accepted";
  title: string;
  body: string;
  reference_id: string | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(
  userId: string,
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return [];
  return data ?? [];
}

export async function markAsRead(id: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllAsRead(userId: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

export function subscribeToNotifications(
  userId: string,
  onNew: (notification: Notification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNew(payload.new as Notification);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
