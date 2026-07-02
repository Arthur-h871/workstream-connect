import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Exercises the real "start"/"chat" happy path against the live monitoramento
// edge function — hits Anthropic for real, so it needs a service-role key to
// provision/tear down an isolated fixture user+org. Skipped entirely when
// that key isn't available (e.g. a contributor's machine, or CI without the
// secret configured) so the rest of the suite stays runnable without it.

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SUPABASE_URL = "https://zuovkxvykjcozxlilmby.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/monitoramento`;

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

const publicEnv = readEnvFile(join(projectRoot, ".env"));
const localEnv = readEnvFile(join(projectRoot, ".env.test.local"));
const ANON_KEY = publicEnv.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;

const skip = !SERVICE_ROLE_KEY
  ? "SUPABASE_SERVICE_ROLE_KEY not set (add it to .env.test.local, gitignored) — skipping live happy-path test"
  : false;

test("monitoramento start/chat happy path with a real fixture user", { skip }, async (t) => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY);

  const suffix = `${process.pid}-${t.name.length}-${Object.keys(process.env).length}`;
  const email = `monitoramento-fixture-${suffix}@example.invalid`;
  const password = `Fixture-${suffix}-Aa1!`;

  let userId;
  let orgId;

  t.after(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Fixture Org ${suffix}` })
    .select("id")
    .single();
  assert.strictEqual(orgError, null, `failed to create fixture org: ${orgError?.message}`);
  orgId = org.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.strictEqual(createError, null, `failed to create fixture user: ${createError?.message}`);
  userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    organization_id: orgId,
    role: "tenant_user",
    full_name: "Fixture User",
  });
  assert.strictEqual(profileError, null, `failed to create fixture profile: ${profileError?.message}`);

  const { data: session, error: sessionError } = await admin
    .from("capture_sessions")
    .insert({
      user_id: userId,
      organization_id: orgId,
      status: "stopped",
      stopped_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.strictEqual(sessionError, null, `failed to create fixture session: ${sessionError?.message}`);
  const sessionId = session.id;

  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  assert.strictEqual(signInError, null, `failed to sign in as fixture user: ${signInError?.message}`);
  const jwt = signIn.session.access_token;

  const startResponse = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      action: "start",
      session_id: sessionId,
      context: "Teste automatizado: revisão de código e testes.",
      screenshot_ids: [],
      linked_tasks: [],
    }),
  });
  const startBody = await startResponse.text();
  assert.strictEqual(startResponse.status, 200, `start failed: ${startBody}`);
  const startDraft = JSON.parse(startBody);
  assert.strictEqual(typeof startDraft.content, "string");
  assert.ok(startDraft.content.length > 0);
  assert.strictEqual(typeof startDraft.hours_worked, "number");
  assert.ok(startDraft.hours_worked >= 0.25 && startDraft.hours_worked <= 24);

  const chatResponse = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      action: "chat",
      session_id: sessionId,
      message: "Ajuste: deixe o texto mais curto, em um único parágrafo.",
    }),
  });
  const chatBody = await chatResponse.text();
  assert.strictEqual(chatResponse.status, 200, `chat failed: ${chatBody}`);
  const chatDraft = JSON.parse(chatBody);
  assert.strictEqual(typeof chatDraft.content, "string");
  assert.ok(chatDraft.content.length > 0);
  assert.strictEqual(typeof chatDraft.hours_worked, "number");

  const { data: messages, error: messagesError } = await admin
    .from("session_messages")
    .select("role")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  assert.strictEqual(messagesError, null);
  assert.strictEqual(messages.length, 4);
  assert.deepStrictEqual(
    messages.map((m) => m.role),
    ["user", "assistant", "user", "assistant"],
  );
});
