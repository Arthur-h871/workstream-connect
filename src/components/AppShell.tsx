import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  CheckSquare,
  User,
  Bell,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

type NavItem = { to: string; label: string; icon: LucideIcon; admin?: boolean };

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/apontamentos", label: "Apontamentos", icon: FileText },
  { to: "/tarefas-org", label: "Tarefas da Org", icon: FolderKanban },
  { to: "/tarefas", label: "Minhas Tarefas", icon: CheckSquare },
  { to: "/perfil", label: "Perfil", icon: User },
  { to: "/admin/membros", label: "Membros", icon: Shield, admin: true },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-copper" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-border bg-surface p-2 shadow-2xl">
            <div className="border-b border-border px-3 py-2">
              <p className="section-label">Notificações</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {[
                { t: "Nova tarefa atribuída", d: "Refatorar fluxo de onboarding", time: "há 3 min", color: "copper" as const },
                { t: "Prazo amanhã", d: "Revisar PR #482", time: "há 1 h", color: "copper" as const },
                { t: "Tarefa concluída por Ana", d: "Setup do ambiente staging", time: "há 4 h", color: "teal" as const },
              ].map((n, i) => (
                <button key={i} className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-background">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.color === "copper" ? "bg-copper" : "bg-teal"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{n.t}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.d}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{n.time}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const location = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-copper">
            <div className="h-2.5 w-2.5 rounded-sm bg-background" />
          </div>
          <span className="text-base font-semibold tracking-tight">Marco</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {nav.map((item) => {
            const active = location.startsWith(item.to);
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
          <Link to="/perfil" className="flex items-center gap-3 rounded-md p-2 hover:bg-background">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">
              JS
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">João Silva</p>
              <p className="truncate text-xs text-muted-foreground">Acme Corp</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main */}
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
