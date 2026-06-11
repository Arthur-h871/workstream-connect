import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { signOut } from "backend/api/services/auth.service";

export const Route = createFileRoute("/aguardando")({
  head: () => ({
    meta: [{ title: "Aguardando aprovação — Marco" }],
  }),
  component: Aguardando,
});

function Aguardando() {
  const nav = useNavigate();

  async function handleSignOut() {
    await signOut();
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-copper">
            <div className="h-3 w-3 rounded-sm bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Marco</span>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-xl font-semibold text-foreground">Pedido em análise</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu pedido de entrada foi enviado. Um administrador vai revisá-lo em breve.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Quando aceito, você poderá entrar normalmente com seu e-mail e senha.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-5 w-full rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
