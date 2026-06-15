import {
  Link,
  useRouterState,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  CheckSquare,
  StickyNote,
  User,
  Bell,
  Shield,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { signOut } from "backend/api/services/auth.service";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  type Notification,
} from "backend/api/services/notifications.service";

type NavItem = { to: string; label: string; icon: LucideIcon; admin?: boolean };

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/apontamentos", label: "Apontamentos", icon: FileText },
  { to: "/notas", label: "Notas", icon: StickyNote },
  { to: "/tarefas-org", label: "Tarefas da Org", icon: FolderKanban },
  { to: "/tarefas", label: "Minhas Tarefas", icon: CheckSquare },
  { to: "/perfil", label: "Perfil", icon: User },
  { to: "/admin/membros", label: "Membros", icon: Shield, admin: true },
];

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

function NotificationBell() {
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const userId = profile.id;

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getNotifications(userId).then((data) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    return subscribeToNotifications(userId, (incoming) => {
      setNotifications((prev) => [incoming, ...prev]);
    });
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    await markAsRead(id);
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? now })),
    );
    await markAllAsRead(userId);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-copper" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="section-label">Notificações</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-teal hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Carregando...
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read_at) handleMarkRead(n.id);
                    }}
                    className={`w-full border-b border-border/50 px-3 py-3 text-left transition-colors last:border-0 hover:bg-background ${
                      !n.read_at ? "bg-copper-soft/20" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          !n.read_at ? "bg-copper" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs leading-snug ${
                            !n.read_at
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {n.body}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {formatTimeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SidebarUser({ onLogout }: { onLogout: () => void }) {
  const { profile } = useRouteContext({ from: "/_authenticated" });

  const initials = profile.full_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() ?? "")
    .join("");

  const roleLabel =
    profile.role === "tenant_admin" || profile.role === "master"
      ? "Admin"
      : "Membro";

  return (
    <div className="flex items-center gap-1">
      <Link
        to="/perfil"
        className="flex flex-1 items-center gap-3 rounded-md p-2 hover:bg-background"
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper-soft text-xs font-semibold text-copper">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile.full_name.trim().split(/\s+/)[0]}</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
        </div>
      </Link>
      <button
        onClick={onLogout}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        aria-label="Sair"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { profile } = useRouteContext({ from: "/_authenticated" });

  const visibleNav = navItems.filter(
    (item) => !item.admin || profile.role !== "tenant_user",
  );

  async function handleLogout() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-copper">
            <div className="h-2.5 w-2.5 rounded-sm bg-background" />
          </div>
          <span className="text-base font-semibold tracking-tight">Marco</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {visibleNav.map((item) => {
            const active = location === item.to || location.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-copper-soft text-copper"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
                {item.admin && (
                  <span className="ml-auto rounded bg-teal-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal">
                    Admin
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <SidebarUser onLogout={handleLogout} />
        </div>
      </aside>

      <main className="ml-60 flex-1">
        <div className="relative mx-auto max-w-[1400px] px-8 py-8">
          {title && (
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <div className="relative">
                <NotificationBell />
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
