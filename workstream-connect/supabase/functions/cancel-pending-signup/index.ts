import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { email } = (await req.json()) as { email?: string };
  if (!email) {
    return new Response(JSON.stringify({ error: "email required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: userId, error: rpcError } = await supabaseAdmin.rpc(
    "get_user_id_by_email",
    { p_email: email },
  );

  if (rpcError || !userId) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: request } = await supabaseAdmin
    .from("member_requests")
    .select("id")
    .eq("user_id", userId as string)
    .single();

  if (!request) {
    return new Response(
      JSON.stringify({ error: "no pending request for this user" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    userId as string,
  );

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
