import { supabase } from "backend/api/supabase";

export type CaptureSession = {
  id: string;
  user_id: string;
  organization_id: string;
  status: "active" | "paused" | "stopped";
  started_at: string;
  paused_at: string | null;
  stopped_at: string | null;
  screenshot_count: number;
  pending_task_links: LinkedTaskPayload[];
};

export type LinkedTaskPayload = {
  task_id: string;
  type: "personal" | "org";
  title: string;
  description?: string | null;
  status: "started" | "concluded";
};

export type ChatDraft = { content: string; hours_worked: number };

export type SessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function mapCaptureSession(row: {
  id: string;
  user_id: string;
  organization_id: string;
  status: "active" | "paused" | "stopped";
  started_at: string;
  paused_at: string | null;
  stopped_at: string | null;
  screenshot_count: number;
  pending_task_links: unknown;
}): CaptureSession {
  return {
    ...row,
    pending_task_links: Array.isArray(row.pending_task_links)
      ? (row.pending_task_links as LinkedTaskPayload[])
      : [],
  };
}

export async function getActiveSession(userId: string): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from("capture_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapCaptureSession(data);
}

export async function getSession(sessionId: string): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from("capture_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return mapCaptureSession(data);
}

export async function createSession(userId: string, orgId: string): Promise<CaptureSession> {
  const { data, error } = await supabase
    .from("capture_sessions")
    .insert({
      user_id: userId,
      organization_id: orgId,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;
  return mapCaptureSession(data);
}

export async function pauseSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("capture_sessions")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function resumeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("capture_sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function stopSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("capture_sessions")
    .update({ status: "stopped", stopped_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from("capture_sessions").delete().eq("id", sessionId);

  if (error) throw error;
}

export async function startMonitoramento(args: {
  sessionId: string;
  context: string;
  screenshotIds: string[];
  linkedTasks: LinkedTaskPayload[];
}): Promise<ChatDraft> {
  const { data, error } = await supabase.functions.invoke("monitoramento", {
    body: {
      action: "start",
      session_id: args.sessionId,
      context: args.context,
      screenshot_ids: args.screenshotIds,
      linked_tasks: args.linkedTasks,
    },
  });
  if (error) throw error;
  return data;
}

export async function chatMonitoramento(sessionId: string, message: string): Promise<ChatDraft> {
  const { data, error } = await supabase.functions.invoke("monitoramento", {
    body: { action: "chat", session_id: sessionId, message },
  });
  if (error) throw error;
  return data;
}

export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((m) => ({ ...m, role: m.role as "user" | "assistant" }));
}

export async function updatePendingTaskLinks(
  sessionId: string,
  links: LinkedTaskPayload[],
): Promise<void> {
  const { error } = await supabase
    .from("capture_sessions")
    .update({ pending_task_links: links })
    .eq("id", sessionId);

  if (error) throw error;
}
