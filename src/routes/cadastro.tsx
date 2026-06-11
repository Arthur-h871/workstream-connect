import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import { getOrgByCode } from "backend/api/services/organizations.service";
import {
  signUp,
  checkPendingSignup,
  cancelPendingSignup,
  getSession,
} from "backend/api/services/auth.service";

export const Route = createFileRoute("/cadastro")({
  beforeLoad: async () => {
    const { session } = await getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Criar conta — Marco" },
      {
        name: "description",
        content: "Crie sua conta Marco e junte-se à sua organização.",
      },
    ],
  }),
  component: Cadastro,
});

type Step = "form" | "confirm" | "pending" | "submitted";

function Cadastro() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    orgId: "",
  });
  const [step, setStep] = useState<Step>("form");
  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const org = await getOrgByCode(form.orgId);
      if (!org) {
        setError(
          "Código de organização inválido. Peça o código correto ao administrador.",
        );
        return;
      }
      setOrgName(org.name);
      setStep("confirm");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsLoading(true);
    try {
      const isPending = await checkPendingSignup(form.email);
      if (isPending) {
        setStep("pending");
        return;
      }
      await doSignUp();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelAndResend() {
    setError(null);
    setIsLoading(true);
    try {
      const { error: cancelError } = await cancelPendingSignup(form.email);
      if (cancelError) {
        setError("Não foi possível cancelar o pedido anterior. Tente novamente.");
        setStep("confirm");
        return;
      }
      await doSignUp();
    } finally {
      setIsLoading(false);
    }
  }

  async function doSignUp() {
    const { error: signUpError } = await signUp(
      form.email,
      form.senha,
      form.nome,
      form.orgId,
    );
    if (signUpError) {
      setError(
        "Não foi possível criar a conta. Verifique os dados e tente novamente.",
      );
      setStep("form");
      return;
    }
    setStep("submitted");
  }

  if (step === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
              <div className="h-3 w-3 rounded-sm bg-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Marco</span>
          </div>
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold">Pedido enviado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu pedido de entrada em{" "}
              <span className="font-medium text-foreground">{orgName}</span> foi
              enviado. Um administrador vai revisá-lo em breve.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Quando aceito, você receberá acesso e poderá entrar com seu e-mail
              e senha.
            </p>
            <button
              onClick={() => nav({ to: "/login" })}
              className="mt-5 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Ir para o login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>

        {step === "confirm" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-foreground">
              Você vai entrar em{" "}
              <span className="font-semibold">{orgName}</span>. Confirmar?
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setStep("form");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1 rounded-md bg-copper px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Aguarde…" : "Confirmar"}
              </button>
            </div>
          </div>
        )}

        {step === "pending" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-foreground">
              Este e-mail já tem um pedido de cadastro pendente. Deseja cancelar
              o pedido anterior e enviar um novo?
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setStep("form");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCancelAndResend}
                disabled={isLoading}
                className="flex-1 rounded-md bg-copper px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Aguarde…" : "Sim, reenviar"}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Junte-se à sua organização.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <Field
              label="Nome"
              value={form.nome}
              onChange={set("nome")}
              hint="Seu nome completo"
              disabled={step !== "form" || isLoading}
            />
            <Field
              label="E-mail"
              type="email"
              value={form.email}
              onChange={set("email")}
              hint="voce@empresa.com"
              disabled={step !== "form" || isLoading}
            />
            <Field
              label="Senha"
              type="password"
              value={form.senha}
              onChange={set("senha")}
              hint="Mínimo 8 caracteres"
              disabled={step !== "form" || isLoading}
            />

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                ID da organização
              </span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={form.orgId}
                  onChange={(e) => set("orgId")(e.target.value.toUpperCase())}
                  placeholder="Código de 6 dígitos"
                  maxLength={6}
                  disabled={step !== "form" || isLoading}
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-foreground placeholder:text-muted-foreground/60 placeholder:tracking-normal focus:border-copper focus:outline-none disabled:opacity-50"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Peça este código ao administrador da sua organização.
              </p>
            </label>

            {error && step === "form" && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={step !== "form" || isLoading}
              className="mt-2 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? "Verificando…" : "Criar conta"}
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
  hint,
  disabled,
}: {
  label: string;
  type?: string;
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
