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
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10);

  const [{ data: monthApontamentos }, { data: streakDates }] = await Promise.all([
    supabase
      .from("apontamentos")
      .select("date, hours_worked")
      .eq("user_id", userId)
      .gte("date", firstOfMonth)
      .order("date", { ascending: false }),

    supabase
      .from("apontamentos")
      .select("date")
      .eq("user_id", userId)
      .gte("date", yearAgo)
      .order("date", { ascending: false }),
  ]);

  if ((!monthApontamentos || monthApontamentos.length === 0) && (!streakDates || streakDates.length === 0)) {
    return { horasNoMes: 0, streak: 0 };
  }

  const horasNoMes = (monthApontamentos ?? []).reduce(
    (sum, apontamento) => sum + Number(apontamento.hours_worked ?? 0),
    0,
  );

  if (!streakDates || streakDates.length === 0) {
    return { horasNoMes, streak: 0 };
  }

  const dates = new Set(streakDates.map((apontamento) => apontamento.date.slice(0, 10)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  for (let day = new Date(today); ; day.setDate(day.getDate() - 1)) {
    const key = day.toISOString().slice(0, 10);
    if (!dates.has(key)) break;
    streak++;
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
