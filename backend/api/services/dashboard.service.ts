import { supabase } from "backend/api/supabase";

export type RecentApontamento = {
  id: string;
  date: string;
  preview: string;
  done: number;
  doing: number;
};

export type PriorityTask = {
  id: string;
  title: string;
  due_date: string | null;
};

export type OrgDeadline = {
  id: string;
  title: string;
  project: string;
  days: number;
};

export type DashboardData = {
  activeDays: string[];
  streak: number;
  horasNoMes: number;
  apontamentosNoMes: number;
  tarefasConcluidas: number;
  projetosAtivos: number;
  recentApontamentos: RecentApontamento[];
  priorityTasks: PriorityTask[];
  orgDeadlines: OrgDeadline[];
};

function calculateStreak(allActiveDays: string[]): number {
  if (allActiveDays.length === 0) return 0;
  const daySet = new Set(allActiveDays);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;
  while (true) {
    const dateStr = cursor.toISOString().split("T")[0];
    if (daySet.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split("T")[0];

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [apontamentosRes, priorityTasksRes, orgDeadlinesRes, completedCountRes, activeProjectsRes] =
    await Promise.all([
      supabase
        .from("apontamentos")
        .select(
          "id, date, content, hours_worked, apontamento_personal_tasks(status), apontamento_org_tasks(status)",
        )
        .eq("user_id", userId)
        .gte("date", sixtyDaysAgoStr)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("personal_tasks")
        .select("id, title, due_date")
        .eq("user_id", userId)
        .neq("status", "completed")
        .order("priority", { ascending: true })
        .limit(3),

      supabase
        .from("org_tasks")
        .select("id, title, due_date, projects ( name )")
        .eq("assigned_to", userId)
        .neq("status", "completed")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(5),

      supabase
        .from("personal_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed"),

      supabase
        .from("org_tasks")
        .select("project_id")
        .eq("assigned_to", userId)
        .neq("status", "completed")
        .not("project_id", "is", null),
    ]);

  const rows = apontamentosRes.data ?? [];

  const thisMonthRows = rows.filter((r) => new Date(r.date + "T00:00:00") >= monthStart);
  const activeDays = [...new Set(thisMonthRows.map((r) => r.date))];
  const allActiveDays = [...new Set(rows.map((r) => r.date))];

  const horasNoMes = thisMonthRows.reduce((sum, r) => sum + Number(r.hours_worked), 0);
  const apontamentosNoMes = thisMonthRows.length;

  const recentApontamentos: RecentApontamento[] = rows.slice(0, 3).map((r) => {
    const allTasks = [...(r.apontamento_personal_tasks ?? []), ...(r.apontamento_org_tasks ?? [])];
    return {
      id: r.id,
      date: r.date,
      preview: r.content.slice(0, 150) || "Sem conteúdo",
      done: allTasks.filter((t) => t.status === "concluded").length,
      doing: allTasks.filter((t) => t.status === "started").length,
    };
  });

  const today = now;
  const orgDeadlines: OrgDeadline[] = (orgDeadlinesRes.data ?? []).map((r) => {
    const due = new Date(r.due_date + "T00:00:00");
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    return {
      id: r.id,
      title: r.title,
      project: (r.projects as any)?.name ?? "—",
      days,
    };
  });

  return {
    activeDays,
    streak: calculateStreak(allActiveDays),
    horasNoMes,
    apontamentosNoMes,
    tarefasConcluidas: completedCountRes.count ?? 0,
    projetosAtivos: new Set((activeProjectsRes.data ?? []).map((r) => r.project_id).filter(Boolean))
      .size,
    recentApontamentos,
    priorityTasks: (priorityTasksRes.data ?? []) as PriorityTask[],
    orgDeadlines,
  };
}
