import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Sparkles, ListChecks } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marco — Registro de trabalho com IA" },
      { name: "description", content: "Marco conecta o trabalho que você faz com o trabalho que precisa ser feito. Apontamentos automáticos por IA para equipes." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-copper">
            <div className="h-2.5 w-2.5 rounded-sm bg-background" />
          </div>
          <span className="text-base font-semibold tracking-tight">Marco</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex items-center gap-1.5 rounded-md bg-copper px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Criar conta <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-24 pt-20 text-center">
        <p className="section-label mb-5">Plataforma de registro de trabalho</p>
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          O que você <span className="text-copper">fez</span> encontra o que você <span className="text-teal">precisa fazer</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground">
          Marco captura prints do seu trabalho, gera apontamentos com IA e conecta tudo às tarefas da sua organização. Sem fricção. Sem timer manual.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/cadastro"
            className="inline-flex items-center gap-1.5 rounded-md bg-copper px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Começar agora <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Ver demonstração
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          { icon: Camera, color: "copper", title: "Captura passiva", desc: "Prints automáticos durante sua sessão de trabalho." },
          { icon: Sparkles, color: "copper", title: "Apontamentos com IA", desc: "Texto descritivo do que foi feito, gerado para você." },
          { icon: ListChecks, color: "teal", title: "Tarefas da organização", desc: "Vincule trabalho real às tarefas planejadas." },
        ].map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} className="rounded-lg border border-border bg-surface p-6">
              <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-md ${f.color === "copper" ? "bg-copper-soft text-copper" : "bg-teal-soft text-teal"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}
