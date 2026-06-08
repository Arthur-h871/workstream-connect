import { createFileRoute } from "@tanstack/react-router";
import { Copy, MoreVertical, Check } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/admin/membros")({
  head: () => ({ meta: [{ title: "Membros — Marco" }, { name: "description", content: "Gerencie membros da organização." }] }),
  component: () => (
    <AppShell title="Membros da Organização">
      <Membros />
    </AppShell>
  ),
});

const members = [
  { name: "João Silva", email: "joao@acme.com", role: "Admin", joined: "12 Jan 2025", initials: "JS" },
  { name: "Ana Costa", email: "ana@acme.com", role: "Membro", joined: "03 Fev 2025", initials: "AC" },
  { name: "Bruno Lima", email: "bruno@acme.com", role: "Membro", joined: "21 Mar 2025", initials: "BL" },
  { name: "Carla Rocha", email: "carla@acme.com", role: "Admin", joined: "08 Abr 2025", initials: "CR" },
  { name: "Diego Santos", email: "diego@acme.com", role: "Membro", joined: "15 Mai 2025", initials: "DS" },
];

function Membros() {
  const [copied, setCopied] = useState(false);
  const orgId = "A3F9K2";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Convide novos membros compartilhando o ID da organização.</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(orgId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
        >
          <span className="text-muted-foreground">ID da organização:</span>
          <span className="font-mono font-semibold tracking-wider text-teal">{orgId}</span>
          {copied ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <div key={m.email} className="group relative rounded-lg border border-border bg-surface p-5">
            <button className="absolute right-3 top-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-copper-soft text-sm font-semibold text-copper">
                {m.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    m.role === "Admin" ? "bg-teal-soft text-teal" : "bg-border text-muted-foreground"
                  }`}>
                    {m.role}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">desde {m.joined}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
