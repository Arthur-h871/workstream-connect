import { createFileRoute, redirect } from "@tanstack/react-router";
import { Copy, Check, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  getMyOrganization,
  getOrgMembers,
  getPendingMembers,
  acceptMember,
  rejectMember,
  promoteToAdmin,
  removeMember,
  type AdminOrgMember,
  type PendingMember,
} from "backend/api/services/organizations.service";

export const Route = createFileRoute("/_authenticated/admin/membros")({
  head: () => ({
    meta: [
      { title: "Membros — Marco" },
      { name: "description", content: "Gerencie membros da organização." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.profile.role === "tenant_user") {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async ({ context }) => {
    const orgId = context.profile.organization_id;
    const [org, members, pending] = await Promise.all([
      getMyOrganization(orgId),
      getOrgMembers(orgId),
      getPendingMembers(orgId),
    ]);
    return { org, members, pending, currentUserId: context.profile.id };
  },
  component: Membros,
});

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(isoStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(isoStr));
}

function MemberAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-11 w-11 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">
      {getInitials(name)}
    </div>
  );
}

function RoleBadge({ role }: { role: AdminOrgMember["role"] }) {
  const isAdmin = role === "tenant_admin" || role === "master";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isAdmin ? "bg-teal-soft text-teal" : "bg-border text-muted-foreground"
      }`}
    >
      {isAdmin ? "Admin" : "Membro"}
    </span>
  );
}

function MemberCard({
  member,
  currentUserId,
  onPromote,
  onRemove,
}: {
  member: AdminOrgMember;
  currentUserId: string;
  onPromote: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isSelf = member.id === currentUserId;
  const isAdmin = member.role === "tenant_admin" || member.role === "master";

  return (
    <div className="group relative rounded-lg border border-border bg-surface p-5">
      {!isSelf && (
        <div className="absolute right-3 top-3">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            aria-label="Ações do membro"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-6 z-20 min-w-[160px] overflow-hidden rounded-md border border-border bg-surface shadow-lg">
                {!isAdmin && (
                  <button
                    onClick={() => {
                      onPromote(member.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-background"
                  >
                    Promover a Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    onRemove(member.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                >
                  Remover da organização
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        <MemberAvatar name={member.full_name} avatarUrl={member.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{member.full_name}</p>
          <div className="mt-2 flex items-center gap-2">
            <RoleBadge role={member.role} />
            <span className="font-mono text-[10px] text-muted-foreground">
              desde {formatDate(member.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingRow({
  request,
  onAccept,
  onReject,
}: {
  request: PendingMember;
  onAccept: (id: string, role: "tenant_user" | "tenant_admin") => Promise<void>;
  onReject: (userId: string, id: string) => Promise<void>;
}) {
  const [state, setState] = useState<
    "idle" | "accepting-user" | "accepting-admin" | "rejecting"
  >("idle");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4">
      <div>
        <p className="text-sm font-medium">{request.full_name}</p>
        <p className="text-xs text-muted-foreground">
          Pedido em {formatDate(request.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setState("accepting-user");
            try {
              await onAccept(request.id, "tenant_user");
            } catch {
              setState("idle");
            }
          }}
          disabled={state !== "idle"}
          className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          {state === "accepting-user" ? "Aceitando..." : "Membro"}
        </button>

        <button
          onClick={async () => {
            setState("accepting-admin");
            try {
              await onAccept(request.id, "tenant_admin");
            } catch {
              setState("idle");
            }
          }}
          disabled={state !== "idle"}
          className="rounded-md bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal hover:opacity-90 disabled:opacity-40"
        >
          {state === "accepting-admin" ? "Aceitando..." : "Admin"}
        </button>

        <button
          onClick={async () => {
            setState("rejecting");
            try {
              await onReject(request.user_id, request.id);
            } catch {
              setState("idle");
            }
          }}
          disabled={state !== "idle"}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          {state === "rejecting" ? "Rejeitando..." : "Rejeitar"}
        </button>
      </div>
    </div>
  );
}

function Membros() {
  const {
    org,
    members: initialMembers,
    pending: initialPending,
    currentUserId,
  } = Route.useLoaderData();

  const [tab, setTab] = useState<"active" | "pending">("active");
  const [members, setMembers] = useState(initialMembers);
  const [pending, setPending] = useState(initialPending);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(org?.code ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handlePromote(memberId: string) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, role: "tenant_admin" as const } : m,
      ),
    );
    promoteToAdmin(memberId).catch(() => {
      setMembers(initialMembers);
      toast.error("Erro ao promover membro.");
    });
  }

  function handleRemove(memberId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    removeMember(memberId).catch(() => {
      setMembers(initialMembers);
      toast.error("Erro ao remover membro.");
    });
  }

  async function handleAccept(
    requestId: string,
    role: "tenant_user" | "tenant_admin",
  ) {
    try {
      await acceptMember(requestId, role);
      setPending((prev) => prev.filter((p) => p.id !== requestId));
    } catch {
      toast.error("Erro ao aceitar pedido.");
    }
  }

  async function handleReject(userId: string, requestId: string) {
    try {
      await rejectMember(userId);
      setPending((prev) => prev.filter((p) => p.id !== requestId));
    } catch {
      toast.error("Erro ao rejeitar pedido.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Convide novos membros compartilhando o código da organização.
        </p>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:border-teal/50"
        >
          <span className="text-muted-foreground">Código:</span>
          <span className="font-mono font-semibold tracking-wider text-teal">
            {org?.code ?? "—"}
          </span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#10B981]" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-muted p-1">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            tab === "active"
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Membros ativos ({members.length})
        </button>
        <button
          onClick={() => setTab("pending")}
          className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
            tab === "pending"
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pendentes
          {pending.length > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-copper px-1.5 py-0.5 text-[10px] font-bold text-background">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {tab === "active" ? (
        members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
            Nenhum membro na organização
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                currentUserId={currentUserId}
                onPromote={handlePromote}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )
      ) : pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
          Nenhum pedido pendente
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((p) => (
            <PendingRow
              key={p.id}
              request={p}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
