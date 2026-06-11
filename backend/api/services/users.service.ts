import { supabase } from "backend/api/supabase";

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  avatar_url: string | null;
  role: "master" | "tenant_admin" | "tenant_user";
  created_at: string;
};

export type UserProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: "master" | "tenant_admin" | "tenant_user";
  organization_id: string;
  org_name: string;
};

export type ProfileStats = {
  horasNoMes: number;
  streak: number;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  data: { full_name?: string; avatar_url?: string },
): Promise<void> {
  await supabase.from("profiles").update(data).eq("id", userId);
}

export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return null;

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  await updateProfile(userId, { avatar_url: publicUrl });

  return publicUrl;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: apontamentos } = await supabase
    .from("apontamentos")
    .select("date, hours_worked")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (!apontamentos || apontamentos.length === 0) {
    return { horasNoMes: 0, streak: 0 };
  }

  const horasNoMes = apontamentos
    .filter((a) => a.date >= firstOfMonth.slice(0, 10))
    .reduce((sum, a) => sum + (a.hours_worked ?? 0), 0);

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = new Set(apontamentos.map((a) => a.date.slice(0, 10)));

  for (let d = new Date(today); ; d.setDate(d.getDate() - 1)) {
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) {
      streak++;
    } else {
      break;
    }
  }

  return { horasNoMes, streak };
}

export type OrgMember = {
  id: string;
  full_name: string;
};

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", orgId)
    .order("full_name");
  if (error) return [];
  return data ?? [];
}
