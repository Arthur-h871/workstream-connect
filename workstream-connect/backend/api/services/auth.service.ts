import { supabase } from "backend/api/supabase";
import { invalidateAuthenticatedProfile } from "@/lib/authenticated-profile-cache";

export async function signIn(email: string, password: string) {
  invalidateAuthenticatedProfile();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  orgCode: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization_code: orgCode,
      },
    },
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  invalidateAuthenticatedProfile();
  return { error };
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function getCurrentUserEmail(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? "";
}

export async function updatePassword(newPassword: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error as Error | null };
}

export async function checkPendingSignup(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_pending_signup", {
    p_email: email,
  });
  if (error) return false;
  return data as boolean;
}

export async function cancelPendingSignup(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke("cancel-pending-signup", {
    body: { email },
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteAccount(): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Não autenticado" };
  const { error } = await supabase.functions.invoke("delete-account", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) return { error: error.message };
  return { error: null };
}
