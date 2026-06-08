import { createFileRoute } from "@tanstack/react-router";
import { Camera, Flame } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Perfil — Marco" }, { name: "description", content: "Sua conta e preferências." }] }),
  component: () => (
    <AppShell title="Perfil">
      <Perfil />
    </AppShell>
  ),
});

function Perfil() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="section-label">Horas este mês</p>
            <p className="mt-2 text-3xl font-semibold text-copper">142h</p>
          </div>
          <div>
            <p className="section-label">Sequência</p>
            <p className="mt-2 flex items-center gap-2 text-3xl font-semibold">
              <Flame className="h-6 w-6 text-copper" /> <span>7 dias</span>
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {/* Avatar */}
        <section className="p-6">
          <p className="section-label mb-4">Foto de perfil</p>
          <div className="flex items-center gap-4">
            <div className="group relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-copper-soft text-2xl font-semibold text-copper">
                JS
              </div>
              <button className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Clique na foto para enviar uma nova imagem.</p>
          </div>
        </section>

        {/* Pessoal */}
        <section className="p-6">
          <p className="section-label mb-4">Informações pessoais</p>
          <div className="space-y-3">
            <Field label="Nome" defaultValue="João Silva" />
            <Field label="E-mail" type="email" defaultValue="joao@acme.com" />
          </div>
          <button className="mt-4 rounded-md bg-copper px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Salvar alterações
          </button>
        </section>

        {/* Senha */}
        <section className="p-6">
          <p className="section-label mb-4">Senha</p>
          <div className="space-y-3">
            <Field label="Senha atual" type="password" />
            <Field label="Nova senha" type="password" />
            <Field label="Confirmar nova senha" type="password" />
          </div>
          <button className="mt-4 rounded-md bg-copper px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Atualizar senha
          </button>
        </section>
      </div>
    </div>
  );
}

function Field({ label, type = "text", defaultValue }: { label: string; type?: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
      />
    </label>
  );
}
