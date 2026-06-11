import { supabase } from "backend/api/supabase";

export type Screenshot = {
  id: string;
  session_id: string;
  captured_at: string;
  storage_path: string;
  file_size_bytes: number;
  deleted_at: string | null;
  signedUrl: string | null;
};

export async function getScreenshots(sessionId: string): Promise<Screenshot[]> {
  const { data, error } = await supabase
    .from("screenshots")
    .select(
      "id, session_id, captured_at, storage_path, file_size_bytes, deleted_at",
    )
    .eq("session_id", sessionId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: true });

  if (error || !data) return [];

  const withUrls = await Promise.all(
    data.map(async (s) => {
      const { data: urlData } = await supabase.storage
        .from("screenshots")
        .createSignedUrl(s.storage_path, 3600);
      return { ...s, signedUrl: urlData?.signedUrl ?? null };
    }),
  );

  return withUrls;
}

export async function softDeleteScreenshot(id: string): Promise<void> {
  const { error } = await supabase
    .from("screenshots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
