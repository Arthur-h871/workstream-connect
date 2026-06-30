import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { signOut, deleteAccount, getSession } from "backend/api/services/auth.service";
import { getProfile } from "backend/api/services/users.service";
import {
  getMyPendingRequest,
  cancelMyMemberRequest,
  applyToOrg,
  getOrgByCode,
} from "backend/api/services/organizations.service";

export const Route = createFileRoute("/aguardando")({
  head: () => ({
    meta: [{ title: "Aguardando aprovação — Marco" }],
  }),
  component: Aguardando,
});

type PageState = "loading" | "pending" | "no-request";

function Aguardando() {
  const nav = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [orgCode, setOrgCode] = useState("");
  const [pollingExpired, setPollingExpired] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (pageState !== "pending") return;
    let attempts = 0;
    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts >= 60) {
        clearInterval(intervalId);
        setPollingExpired(true);
        return;
      }
      const { session } = await getSession();
      if (!session) return;
      const profile = await getProfile(session.user.id);
      if (profile) {
        clearInterval(intervalId);
        nav({ to: "/dashboard" });
      }
    }, 5000);
    return () => clearInterval(intervalId);
  }, [pageState, nav]);

  async function loadStatus() {
    const request = await getMyPendingRequest();
    if (request) {
      setOrgName(request.orgName);
      setPageState("pending");
    } else {
      setPageState("no-request");
    }
  }

  async function handleCancelRequest() {
    setError(null);
    setIsLoading(true);
    try {
      const { error: cancelError } = await cancelMyMemberRequest();
      if (cancelError) {
        setError("Não foi possível cancelar o pedido. Tente novamente.");
        return;
      }
      setOrgName("");
      setOrgCode("");
      setConfirmDelete(false);
      setPageState("no-request");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (orgCode.length !== 6) {
      setError("O código deve ter 6 caracteres.");
      return;
    }
    setIsLoading(true);
    try {
      const org = await getOrgByCode(orgCode);
      if (!org) {
        setError("Código inválido. Peça o código ao administrador.");
        return;
      }
      const { error: applyError } = await applyToOrg(orgCode);
      if (applyError) {
        setError("Não foi possível enviar o pedido. Tente novamente.");
        return;
      }
      setOrgName(org.name);
      setOrgCode("");
      setPageState("pending");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    setIsLoading(true);
    try {
      const { error: deleteError } = await deleteAccount();
      if (deleteError) {
        setError("Não foi possível excluir a conta. Tente novamente.");
        setConfirmDelete(false);
        return;
      }
      await signOut();
      nav({ to: "/login" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>

        {pageState === "loading" && (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted-foreground">Carregando…</p>
          </div>
        )}

        {pageState === "pending" && (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold text-foreground">Pedido em análise</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu pedido de entrada em{" "}
              <span className="font-medium text-foreground">{orgName}</span> foi
              enviado. Um administrador vai revisá-lo em breve.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Quando aceito, você terá acesso completo e poderá entrar normalmente.
            </p>
            {pollingExpired && (
              <p className="mt-3 text-xs text-muted-foreground">
                Ainda aguardando aprovação. Entre em contato com o administrador.
              </p>
            )}

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <div className="mt-5 space-y-2">
              <button
                onClick={handleCancelRequest}
                disabled={isLoading}
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {isLoading ? "Aguarde…" : "Cancelar pedido"}
              </button>

              <DeleteButton
                confirm={confirmDelete}
                isLoading={isLoading}
                onRequest={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={handleDeleteAccount}
              />

              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Sair
              </button>
            </div>
          </div>
        )}

        {pageState === "no-request" && (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold text-foreground">Sem organização</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Você não pertence a nenhuma organização. Insira o código de uma
              organização para solicitar acesso.
            </p>

            <form onSubmit={handleApply} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Código da organização
                </span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={isLoading}
                    className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-foreground focus:border-copper focus:outline-none disabled:opacity-50"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Código de 6 dígitos fornecido pelo administrador.
                </p>
              </label>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={isLoading || orgCode.length !== 6}
                className="w-full rounded-md bg-copper px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? "Aguarde…" : "Solicitar entrada"}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              <DeleteButton
                confirm={confirmDelete}
                isLoading={isLoading}
                onRequest={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={handleDeleteAccount}
              />

              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Sair
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteButton({
  confirm,
  isLoading,
  onRequest,
  onCancel,
  onConfirm,
}: {
  confirm: boolean;
  isLoading: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirm) {
    return (
      <button
        onClick={onRequest}
        disabled={isLoading}
        className="w-full rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
      >
        Excluir minha conta
      </button>
    );
  }

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs text-destructive">
        Tem certeza? Sua conta será excluída permanentemente.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "Aguarde…" : "Sim, excluir"}
        </button>
      </div>
    </div>
  );
}
