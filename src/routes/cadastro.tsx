import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/cadastro")({
  head: () => ({ meta: [{ title: "Criar conta — Marco" }, { name: "description", content: "Crie sua conta Marco e junte-se à sua organização." }] }),
  component: Cadastro,
});

function Cadastro() {
  const nav = useNavigate();
  const [form, setForm] = useState({ nome: "", email: "", senha: "", orgId: "" });
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Junte-se à sua organização.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              nav({ to: "/dashboard" });
            }}
            className="mt-5 space-y-3"
          >
            <Field label="Nome" value={form.nome} onChange={set("nome")} placeholder="Seu nome completo" />
            <Field label="E-mail" type="email" value={form.email} onChange={set("email")} placeholder="voce@empresa.com" />
            <Field label="Senha" type="password" value={form.senha} onChange={set("senha")} placeholder="Mínimo 8 caracteres" />

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">ID da organização</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={form.orgId}
                  onChange={(e) => set("orgId")(e.target.value.toUpperCase())}
                  placeholder="Código de 6 dígitos"
                  maxLength={6}
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-foreground placeholder:text-muted-foreground/60 placeholder:tracking-normal focus:border-copper focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Peça este código ao administrador da sua organização.
              </p>
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Criar conta
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/login" className="text-copper hover:underline">
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-copper focus:outline-none"
      />
    </label>
  );
}
