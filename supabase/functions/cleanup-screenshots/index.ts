import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH_SIZE = 500;

interface CleanupResult {
  softDeleted: number;
  expired: number;
  errors: string[];
}

async function deleteBatch(
  storagePaths: string[],
): Promise<{ count: number; errors: string[] }> {
  if (storagePaths.length === 0) return { count: 0, errors: [] };

  const errors: string[] = [];
  let deleted = 0;

  for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
    const batch = storagePaths.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from("screenshots").remove(batch);
    if (error) {
      errors.push(`Storage batch error: ${error.message}`);
    } else {
      deleted += batch.length;
    }
  }

  return { count: deleted, errors };
}

async function cleanupSoftDeleted(): Promise<{
  count: number;
  errors: string[];
}> {
  const { data, error } = await supabase
    .from("screenshots")
    .select("id, storage_path")
    .not("deleted_at", "is", null)
    .limit(5000);

  if (error) {
    return { count: 0, errors: [`Query error: ${error.message}`] };
  }
  if (!data || data.length === 0) return { count: 0, errors: [] };

  const storagePaths = data.map((s) => s.storage_path);
  const ids = data.map((s) => s.id);

  const { count, errors } = await deleteBatch(storagePaths);

  const { error: dbError } = await supabase
    .from("screenshots")
    .delete()
    .in("id", ids);

  if (dbError) {
    errors.push(`DB delete error: ${dbError.message}`);
  }

  return { count, errors };
}

async function cleanupExpired(): Promise<{ count: number; errors: string[] }> {
  const { data, error } = await supabase
    .from("screenshots")
    .select(
      `
      id,
      storage_path,
      capture_sessions!inner (
        stopped_at,
        organizations!inner (
          retention_days
        )
      )
    `,
    )
    .is("deleted_at", null)
    .not("capture_sessions.stopped_at", "is", null)
    .limit(5000);

  if (error) {
    return { count: 0, errors: [`Query error: ${error.message}`] };
  }
  if (!data || data.length === 0) return { count: 0, errors: [] };

  const now = Date.now();

  // deno-lint-ignore no-explicit-any
  const expired = data.filter((s: any) => {
    const retentionDays =
      s.capture_sessions.organizations.retention_days ?? 30;
    const stoppedAt = new Date(s.capture_sessions.stopped_at).getTime();
    const expiresAt = stoppedAt + retentionDays * 24 * 60 * 60 * 1000;
    return now > expiresAt;
  });

  if (expired.length === 0) return { count: 0, errors: [] };

  // deno-lint-ignore no-explicit-any
  const storagePaths = expired.map((s: any) => s.storage_path);
  // deno-lint-ignore no-explicit-any
  const ids = expired.map((s: any) => s.id);

  const { count, errors } = await deleteBatch(storagePaths);

  const { error: dbError } = await supabase
    .from("screenshots")
    .delete()
    .in("id", ids);

  if (dbError) {
    errors.push(`DB delete error: ${dbError.message}`);
  }

  return { count, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  console.log("[cleanup-screenshots] Iniciando limpeza...");

  const result: CleanupResult = {
    softDeleted: 0,
    expired: 0,
    errors: [],
  };

  try {
    const softResult = await cleanupSoftDeleted();
    result.softDeleted = softResult.count;
    result.errors.push(...softResult.errors);

    const expiredResult = await cleanupExpired();
    result.expired = expiredResult.count;
    result.errors.push(...expiredResult.errors);
  } catch (e) {
    result.errors.push(`Unexpected error: ${String(e)}`);
  }

  console.log(
    `[cleanup-screenshots] Concluído — soft-deleted: ${result.softDeleted}, expired: ${result.expired}, errors: ${result.errors.length}`,
  );

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
