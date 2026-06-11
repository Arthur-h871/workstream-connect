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
};

export async function getActiveSession(
  userId: string,
): Promise<CaptureSession | null> {
  const { data, error } = await supabase
    .from("capture_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function createSession(
  userId: string,
  orgId: string,
): Promise<CaptureSession> {
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
  return data;
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
  const { error } = await supabase
    .from("capture_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) throw error;
}

export async function triggerGenerateReport(
  sessionId: string,
): Promise<{ apontamento_id: string }> {
  const { data, error } = await supabase.functions.invoke("generate-report", {
    body: { session_id: sessionId },
  });
  if (error) throw error;
  return data;
}
