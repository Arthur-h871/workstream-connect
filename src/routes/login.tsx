import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn, getSession } from "backend/api/services/auth.service";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Marco" },
      { name: "description", content: "Acesse sua conta Marco." },
    ],
  }),
  beforeLoad: async () => {
    const { session } = await getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: authError } = await signIn(email, senha);

    setIsLoading(false);

    if (authError) {
      setError("E-mail ou senha incorretos. Verifique suas credenciais.");
      return;
    }

    nav({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse seu espaço de trabalho.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              hint="voce@empresa.com"
              disabled={isLoading}
            />
            <Field
              label="Senha"
              type="password"
              value={senha}
              onChange={setSenha}
              hint="••••••••"
              disabled={isLoading}
            />

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs">
            <button className="text-muted-foreground hover:text-foreground">
              Esqueci minha senha
            </button>
            <Link to="/cadastro" className="text-copper hover:underline">
              Criar conta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-copper focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
