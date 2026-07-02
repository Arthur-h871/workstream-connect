import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveProvider } from "./providers/resolve.ts";
import type { NormalizedMessage, Draft } from "./providers/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SYSTEM_PROMPT = `Você é um assistente de produtividade que ajuda o usuário a redigir um apontamento de trabalho em português brasileiro, com base em screenshots da tela e no contexto fornecido.

Este é um chat de acompanhamento: a cada mensagem (a inicial, com screenshots, ou um ajuste em texto livre) você deve responder ajustando o apontamento e retornando um rascunho atualizado.

Responda SEMPRE e APENAS com um JSON válido, sem markdown, sem texto fora do JSON:
{ "content": string, "hours_worked": number }

"content": descrição do trabalho em 2-4 parágrafos, tom profissional. Se o usuário pedir um ajuste, aplique e retorne o texto completo já atualizado, nunca um diff.
"hours_worked": decimal entre 0.25 e 24. Se o usuário informar um valor explícito, use-o dentro dos limites.`;

type LinkedTaskInput = {
  task_id: string;
  type: "personal" | "org";
  title: string;
  description?: string | null;
  status: "started" | "concluded";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function parseDraft(responseText: string, fallback: Draft): Draft {
  try {
    const parsed = JSON.parse(responseText);
    return {
      content: String(parsed.content ?? fallback.content),
      hours_worked: Math.min(
        24,
        Math.max(0.25, Number(parsed.hours_worked) || fallback.hours_worked),
      ),
    };
  } catch (e) {
    console.error("[monitoramento] Falha ao parsear resposta do Haiku:", e);
    return fallback;
  }
}

function formatLinkedTasks(linkedTasks: LinkedTaskInput[]): string {
  if (linkedTasks.length === 0) return "Nenhuma tarefa vinculada.";
  return linkedTasks
    .map(
      (t) =>
        `- [${t.type === "personal" ? "pessoal" : "org"}] ${t.title}${t.description ? ` — ${t.description}` : ""} (status: ${t.status === "concluded" ? "concluída" : "iniciada"})`,
    )
    .join("\n");
}

async function loadSession(sessionId: string, userId: string) {
  const { data: session, error } = await supabase
    .from("capture_sessions")
    .select("id, user_id, started_at, stopped_at")
    .eq("id", sessionId)
    .single();

  if (error || !session) return null;
  if (session.user_id !== userId) return null;
  return session;
}

async function handleStart(userId: string, body: Record<string, unknown>): Promise<Response> {
  const sessionId = String(body.session_id ?? "");
  const context = String(body.context ?? "");
  const screenshotIds = Array.isArray(body.screenshot_ids) ? (body.screenshot_ids as string[]) : [];
  const linkedTasks = Array.isArray(body.linked_tasks)
    ? (body.linked_tasks as LinkedTaskInput[])
    : [];

  const session = await loadSession(sessionId, userId);
  if (!session) return json({ error: "Session not found or forbidden" }, 403);

  await supabase
    .from("capture_sessions")
    .update({ pending_task_links: linkedTasks })
    .eq("id", sessionId);

  const { data: screenshots } = await supabase
    .from("screenshots")
    .select("id, storage_path")
    .eq("session_id", sessionId)
    .in("id", screenshotIds.length > 0 ? screenshotIds : ["00000000-0000-0000-0000-000000000000"]);

  const urlResults = await Promise.all(
    (screenshots ?? []).map((s) =>
      supabase.storage.from("screenshots").createSignedUrl(s.storage_path, 300),
    ),
  );
  const imageUrls = urlResults.map((r) => r.data?.signedUrl).filter((u): u is string => Boolean(u));

  const durationMs = session.stopped_at
    ? new Date(session.stopped_at).getTime() - new Date(session.started_at).getTime()
    : 0;
  const durationMinutes = Math.round(durationMs / 60000);

  const userText = [
    `A sessão de trabalho durou ${durationMinutes} minutos e tem ${imageUrls.length} screenshot(s).`,
    context.trim() ? `Contexto adicional: ${context.trim()}` : "",
    `Tarefas vinculadas:\n${formatLinkedTasks(linkedTasks)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const fallback: Draft = {
    content: `Sessão de trabalho de ${durationMinutes} minutos. ${imageUrls.length} screenshot(s) capturado(s).`,
    hours_worked: Math.max(0.25, Math.round((durationMinutes / 60) * 4) / 4),
  };

  let responseText = "";
  try {
    const provider = resolveProvider();
    responseText = await provider.generate(SYSTEM_PROMPT, [
      { role: "user", text: userText, imageUrls },
    ]);
  } catch (e) {
    console.error("[monitoramento] LLM provider error:", e);
  }

  const draft = parseDraft(responseText, fallback);

  await supabase.from("session_messages").insert([
    { session_id: sessionId, role: "user", content: userText },
    { session_id: sessionId, role: "assistant", content: JSON.stringify(draft) },
  ]);

  return json(draft);
}

async function handleChat(userId: string, body: Record<string, unknown>): Promise<Response> {
  const sessionId = String(body.session_id ?? "");
  const message = String(body.message ?? "");

  const session = await loadSession(sessionId, userId);
  if (!session) return json({ error: "Session not found or forbidden" }, 403);

  const { data: history } = await supabase
    .from("session_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const lastAssistant = [...(history ?? [])].reverse().find((m) => m.role === "assistant");
  const fallback: Draft = lastAssistant
    ? parseDraft(lastAssistant.content, { content: "", hours_worked: 0.25 })
    : { content: "", hours_worked: 0.25 };

  const messages: NormalizedMessage[] = [
    ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", text: m.content })),
    { role: "user" as const, text: message },
  ];

  let responseText = "";
  try {
    const provider = resolveProvider();
    responseText = await provider.generate(SYSTEM_PROMPT, messages);
  } catch (e) {
    console.error("[monitoramento] LLM provider error:", e);
  }

  const draft = parseDraft(responseText, fallback);

  await supabase.from("session_messages").insert([
    { session_id: sessionId, role: "user", content: message },
    { session_id: sessionId, role: "assistant", content: JSON.stringify(draft) },
  ]);

  return json(draft);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const user = await authenticate(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json()) as Record<string, unknown>;

  if (body.action === "start") return handleStart(user.id, body);
  if (body.action === "chat") return handleChat(user.id, body);
  return json({ error: "invalid action" }, 400);
});
