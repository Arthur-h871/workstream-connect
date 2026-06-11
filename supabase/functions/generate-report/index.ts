import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { session_id } = await req.json();
  if (!session_id) {
    return new Response(JSON.stringify({ error: "session_id required" }), {
      status: 400,
    });
  }

  const { data: session, error: sessionError } = await supabase
    .from("capture_sessions")
    .select("id, user_id, organization_id, started_at, stopped_at, status")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
    });
  }
  if (session.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  if (session.status !== "stopped") {
    return new Response(
      JSON.stringify({ error: "Session is not stopped" }),
      { status: 422 },
    );
  }

  const { data: screenshots, error: screenshotsError } = await supabase
    .from("screenshots")
    .select("id, storage_path, captured_at")
    .eq("session_id", session_id)
    .is("deleted_at", null)
    .order("captured_at", { ascending: true });

  if (screenshotsError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch screenshots" }),
      { status: 500 },
    );
  }
  if (!screenshots || screenshots.length === 0) {
    return new Response(
      JSON.stringify({ error: "No screenshots to process" }),
      { status: 422 },
    );
  }

  const urlPromises = screenshots.map((s) =>
    supabase.storage.from("screenshots").createSignedUrl(s.storage_path, 300)
  );
  const urlResults = await Promise.all(urlPromises);
  const imageUrls = urlResults
    .map((r) => r.data?.signedUrl)
    .filter((u): u is string => Boolean(u));

  if (imageUrls.length === 0) {
    return new Response(
      JSON.stringify({ error: "Failed to generate signed URLs" }),
      { status: 500 },
    );
  }

  const durationMs = session.stopped_at
    ? new Date(session.stopped_at).getTime() -
      new Date(session.started_at).getTime()
    : 0;
  const durationMinutes = Math.round(durationMs / 60000);

  const imageContent = imageUrls.map((url) => ({
    type: "image" as const,
    source: {
      type: "url" as const,
      url,
    },
  }));

  const systemPrompt =
    `Você é um assistente de produtividade que analisa screenshots de trabalho e gera relatórios de apontamento profissionais em português brasileiro.

Ao analisar as imagens, identifique:
- O que o usuário estava fazendo (contexto de trabalho)
- Ferramentas e aplicações utilizadas
- Tarefas ou projetos visíveis

Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura:
{
  "content": "Descrição detalhada do trabalho realizado em 2-4 parágrafos",
  "hours_worked": <número decimal entre 0.25 e 24, estimado com base na duração>
}`;

  const userMessage =
    `Analise os ${imageUrls.length} screenshots abaixo. A sessão de trabalho durou ${durationMinutes} minutos. Gere um apontamento profissional descrevendo o trabalho realizado.`;

  let reportContent = "";
  let hoursWorked = 0.5;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: userMessage },
          ],
        },
      ],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const parsed = JSON.parse(responseText);
    reportContent = parsed.content ?? "";
    hoursWorked = Math.min(
      24,
      Math.max(0.25, Number(parsed.hours_worked) || 0.5),
    );
  } catch (e) {
    console.error("Anthropic API error:", e);
    reportContent =
      `Sessão de trabalho de ${durationMinutes} minutos. ${imageUrls.length} screenshot(s) capturado(s).`;
    hoursWorked = Math.round((durationMinutes / 60) * 4) / 4;
  }

  const apontamentoDate = session.started_at.split("T")[0];

  const { data: apontamento, error: apontamentoError } = await supabase
    .from("apontamentos")
    .insert({
      user_id: session.user_id,
      organization_id: session.organization_id,
      session_id: session.id,
      date: apontamentoDate,
      content: reportContent,
      hours_worked: hoursWorked,
    })
    .select("id")
    .single();

  if (apontamentoError || !apontamento) {
    return new Response(
      JSON.stringify({ error: "Failed to create apontamento" }),
      { status: 500 },
    );
  }

  await supabase.from("notifications").insert({
    user_id: session.user_id,
    type: "new_org_task",
    title: "Apontamento gerado",
    body: `Seu apontamento de ${durationMinutes} minutos foi criado com sucesso.`,
    reference_id: apontamento.id,
    reference_type: "apontamento",
  });

  return new Response(JSON.stringify({ apontamento_id: apontamento.id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
