import { supabase } from "backend/api/supabase";
import { signIn } from "backend/api/services/auth.service";

export async function getOrgByCode(code) {
  const { data, error } = await supabase.rpc("get_org_name_by_code", {
    p_code: code,
  });
  if (error || !data) return null;
  return { name: data };
}

export async function getMyOrganization(orgId) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, code")
    .eq("id", orgId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function getOrgMembers(orgId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function getPendingMembers(orgId) {
  const { data, error } = await supabase
    .from("member_requests")
    .select("id, user_id, full_name, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function acceptMember(requestId, role) {
  const { data: req, error: reqErr } = await supabase
    .from("member_requests")
    .select("user_id, organization_id, full_name")
    .eq("id", requestId)
    .single();

  if (reqErr || !req) throw new Error("Pedido não encontrado");

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: req.user_id,
    organization_id: req.organization_id,
    full_name: req.full_name,
    role,
  });

  if (profileErr) throw profileErr;

  await supabase.from("user_settings").insert({ user_id: req.user_id });

  await supabase.from("member_requests").delete().eq("id", requestId);

  await supabase.from("notifications").insert({
    user_id: req.user_id,
    type: "member_accepted",
    title: "Você foi aceito na organização",
    body: "Seu pedido de entrada foi aprovado. Bem-vindo!",
  });
}

export async function rejectMember(userId) {
  const { error } = await supabase.functions.invoke("reject-member", {
    body: { user_id: userId },
  });
  if (error) throw error;
}

export async function promoteToAdmin(memberId) {
  const { error } = await supabase
    .from("profiles")
    .update({ role: "tenant_admin" })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId) {
  const { error } = await supabase.from("profiles").delete().eq("id", memberId);
  if (error) throw error;
}

export async function createOrganization(data) {
  const { data: result, error: fnError } = await supabase.functions.invoke(
    "create-organization",
    { body: data },
  );

  if (fnError || !result?.orgCode) {
    return {
      orgCode: null,
      error: result?.error ?? fnError?.message ?? "Erro ao criar organização",
    };
  }

  const { error: signInError } = await signIn(data.adminEmail, data.adminPassword);
  if (signInError) {
    return {
      orgCode: null,
      error:
        "Organização criada, mas não foi possível entrar automaticamente. Tente fazer login manualmente.",
    };
  }

  return { orgCode: result.orgCode, error: null };
}
