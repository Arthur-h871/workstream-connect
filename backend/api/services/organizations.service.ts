import { supabase } from "backend/api/supabase";
import { signIn } from "backend/api/services/auth.service";

export type AdminOrgMember = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: "master" | "tenant_admin" | "tenant_user";
  created_at: string;
};

export type PendingMember = {
  id: string;
  user_id: string;
  full_name: string;
  created_at: string;
};

export type CreateOrganizationData = {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  orgName: string;
  orgPassword: string;
};

export type CreateOrganizationResult = {
  orgCode: string | null;
  error: string | null;
};

type CreateOrganizationResponse = {
  orgCode?: string;
  error?: string;
};

export async function getOrgByCode(code: string): Promise<{ name: string } | null> {
  const { data, error } = await supabase.rpc("get_org_name_by_code", {
    p_code: code,
  });
  if (error || !data) return null;
  return { name: data };
}

export async function getMyOrganization(
  orgId: string,
): Promise<{
  id: string;
  name: string;
  code: string;
  ai_provider: "anthropic" | "gemini";
} | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, code, ai_provider")
    .eq("id", orgId)
    .single();
  if (error || !data) return null;
  return data as {
    id: string;
    name: string;
    code: string;
    ai_provider: "anthropic" | "gemini";
  };
}

export async function updateOrgAiProvider(
  orgId: string,
  provider: "anthropic" | "gemini",
): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ ai_provider: provider })
    .eq("id", orgId);
  if (error) throw error;
}

export async function getOrgMembers(orgId: string): Promise<AdminOrgMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as AdminOrgMember[];
}

export async function getPendingMembers(orgId: string): Promise<PendingMember[]> {
  const { data, error } = await supabase
    .from("member_requests")
    .select("id, user_id, full_name, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PendingMember[];
}

export async function acceptMember(
  requestId: string,
  role: "tenant_user" | "tenant_admin",
): Promise<void> {
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

export async function rejectMember(userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("reject-member", {
    body: { user_id: userId },
  });
  if (error) throw error;
}

export async function promoteToAdmin(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ role: "tenant_admin" })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("profiles").delete().eq("id", memberId);
  if (error) throw error;
}

export async function getMyPendingRequest(): Promise<{ orgName: string; orgId: string } | null> {
  const { data, error } = await supabase.rpc("get_my_pending_request");
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { org_name: string; org_id: string };
  return { orgName: row.org_name, orgId: row.org_id };
}

export async function cancelMyMemberRequest(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("cancel_my_member_request");
  if (error) return { error: error.message };
  return { error: null };
}

export async function applyToOrg(orgCode: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("apply_to_org", { p_org_code: orgCode });
  if (error) return { error: error.message };
  return { error: null };
}

export async function createOrganization(
  data: CreateOrganizationData,
): Promise<CreateOrganizationResult> {
  const { data: result, error: fnError } = await supabase.functions.invoke(
    "create-organization",
    { body: data },
  );

  const response = result as CreateOrganizationResponse | null;

  if (fnError || !response?.orgCode) {
    return {
      orgCode: null,
      error: response?.error ?? fnError?.message ?? "Erro ao criar organização",
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

  return { orgCode: response.orgCode, error: null };
}
