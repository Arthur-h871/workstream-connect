import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Building2, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { createOrganization } from "backend/api/services/organizations.service";
import { getSession } from "backend/api/services/auth.service";

export const Route = createFileRoute("/cadastro-organizacao")({
  beforeLoad: async () => {
    const { session } = await getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Cadastrar organização — Marco" },
      {
        name: "description",
        content: "Crie sua organização no Marco e convide sua equipe.",
      },
    ],
  }),
  component: CadastroOrganizacao,
});

type OrgStep = "admin-form" | "org-form" | "token";

function CadastroOrganizacao() {
  const nav = useNavigate();
  const [step, setStep] = useState<OrgStep>("admin-form");
  const [adminForm, setAdminForm] = useState({
    nome: "",
    email: "",
    senha: "",
    confirmarSenha: "",
  });
  const [orgForm, setOrgForm] = useState({
    orgNome: "",
    orgSenha: "",
    confirmarOrgSenha: "",
  });
  const [orgCode, setOrgCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAdmin =
    (k: keyof typeof adminForm) => (v: string) =>
      setAdminForm((f) => ({ ...f, [k]: v }));

  const setOrg =
    (k: keyof typeof orgForm) => (v: string) =>
      setOrgForm((f) => ({ ...f, [k]: v }));

  function handleAdminNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (adminForm.senha.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (adminForm.senha !== adminForm.confirmarSenha) {
      setError("As senhas não coincidem.");
      return;
    }

    setStep("org-form");
  }

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (orgForm.orgSenha.length < 4) {
      setError("A senha da organização deve ter no mínimo 4 caracteres.");
      return;
    }
    if (orgForm.orgSenha !== orgForm.confirmarOrgSenha) {
      setError("As senhas da organização não coincidem.");
      return;
    }

    setIsLoading(true);
    try {
      const { orgCode: code, error: createError } = await createOrganization({
        adminName: adminForm.nome,
        adminEmail: adminForm.email,
        adminPassword: adminForm.senha,
        orgName: orgForm.orgNome,
        orgPassword: orgForm.orgSenha,
      });

      if (createError || !code) {
        setError(createError ?? "Erro ao criar organização. Tente novamente.");
        return;
      }

      setOrgCode(code);
      setStep("token");
    } finally {
      setIsLoading(false);
    }
  }

  if (step === "token") {
    return (
      <AuthShell>
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold">Organização criada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compartilhe este código com sua equipe para que entrem na organização:
          </p>
          <p className="mt-4 font-mono text-2xl font-semibold tracking-[0.3em] text-copper">
            {orgCode}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Guarde este código — ele será necessário para novos membros se cadastrarem.
          </p>
          <button
            onClick={() => nav({ to: "/dashboard" })}
            className="mt-6 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Acessar o dashboard
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-lg border border-teal/30 bg-surface p-6 shadow-[0_0_0_1px_rgba(20,184,166,0.08)]">
        <div className="mb-5 flex items-center gap-2">
          <StepIndicator active={step === "admin-form"} label="1" title="Seus dados" />
          <div className="h-px flex-1 bg-border" />
          <StepIndicator active={step === "org-form"} label="2" title="Organização" />
        </div>

        {step === "admin-form" && (
          <>
            <h1 className="text-lg font-semibold">Criar organização</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Primeiro, informe seus dados como administrador.
            </p>

            <form onSubmit={handleAdminNext} className="mt-5 space-y-3">
              <Field
                label="Nome"
                value={adminForm.nome}
                onChange={setAdmin("nome")}
                hint="Seu nome completo"
                disabled={isLoading}
                required
              />
              <Field
                label="E-mail"
                type="email"
                value={adminForm.email}
                onChange={setAdmin("email")}
                hint="voce@empresa.com"
                disabled={isLoading}
                required
              />
              <Field
                label="Senha"
                type="password"
                value={adminForm.senha}
                onChange={setAdmin("senha")}
                hint="Mínimo 8 caracteres"
                disabled={isLoading}
                required
              />
              <Field
                label="Confirmar senha"
                type="password"
                value={adminForm.confirmarSenha}
                onChange={setAdmin("confirmarSenha")}
                hint="Repita a senha"
                disabled={isLoading}
                required
              />

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Próximo
              </button>
            </form>
          </>
        )}

        {step === "org-form" && (
          <>
            <h1 className="text-lg font-semibold">Dados da organização</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina o nome e a senha de acesso da sua equipe.
            </p>

            <form onSubmit={handleOrgSubmit} className="mt-5 space-y-3">
              <Field
                label="Nome da organização"
                value={orgForm.orgNome}
                onChange={setOrg("orgNome")}
                hint="Ex: Acme Corp"
                disabled={isLoading}
                required
              />
              <Field
                label="Senha da organização"
                type="password"
                value={orgForm.orgSenha}
                onChange={setOrg("orgSenha")}
                hint="Senha compartilhada com a equipe"
                disabled={isLoading}
                required
              />
              <Field
                label="Confirmar senha da organização"
                type="password"
                value={orgForm.confirmarOrgSenha}
                onChange={setOrg("confirmarOrgSenha")}
                hint="Repita a senha da organização"
                disabled={isLoading}
                required
              />

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("admin-form");
                    setError(null);
                  }}
                  disabled={isLoading}
                  className="flex-1 rounded-md border border-border px-3 py-2.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isLoading ? "Criando…" : "Criar organização"}
                </button>
              </div>
            </form>
          </>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <Link
            to="/cadastro"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar para cadastro de membro
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-soft">
            <Building2 className="h-5 w-5 text-teal" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <span className="text-lg font-semibold tracking-tight">Marco</span>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-teal">
              Nova organização
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function StepIndicator({
  active,
  label,
  title,
}: {
  active: boolean;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          active
            ? "bg-copper text-primary-foreground"
            : "border border-border text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
        {title}
      </span>
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
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        disabled={disabled}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-copper focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
