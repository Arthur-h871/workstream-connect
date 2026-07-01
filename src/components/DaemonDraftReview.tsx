import { useState, useMemo } from "react";
import { createApontamentoFromDraft } from "backend/api/services/apontamentos.service";

type DirectoryDiff = {
  created: string[];
  modified: string[];
  deleted: string[];
};

type DirectoryDraftContent = {
  content: string;
  hours_worked: number;
  type?: string;
  claude_code_session_id?: string;
  claude_code_session_url?: string;
};

type DirectoryDraft = {
  dir_id: string;
  path: string;
  description: string;
  diff: DirectoryDiff;
  draft: DirectoryDraftContent;
};

type Props = {
  sessionId: string;
  drafts: unknown[];
  orgId: string;
  userId: string;
  onComplete: () => void;
};

function totalChanges(diff: DirectoryDiff): number {
  return diff.created.length + diff.modified.length + diff.deleted.length;
}

function castDraft(raw: unknown): DirectoryDraft {
  const d = raw as Record<string, unknown>;
  const diff = (d.diff ?? {}) as Record<string, unknown>;
  const draft = (d.draft ?? {}) as Record<string, unknown>;
  return {
    dir_id: String(d.dir_id ?? ""),
    path: String(d.path ?? ""),
    description: String(d.description ?? ""),
    diff: {
      created: Array.isArray(diff.created) ? (diff.created as string[]) : [],
      modified: Array.isArray(diff.modified) ? (diff.modified as string[]) : [],
      deleted: Array.isArray(diff.deleted) ? (diff.deleted as string[]) : [],
    },
    draft: {
      content: String(draft.content ?? ""),
      hours_worked: (() => { const h = Number(draft.hours_worked); return isNaN(h) ? 0.25 : h; })(),
      type: typeof draft.type === "string" ? draft.type : undefined,
      claude_code_session_id:
        typeof draft.claude_code_session_id === "string"
          ? draft.claude_code_session_id
          : undefined,
      claude_code_session_url:
        typeof draft.claude_code_session_url === "string"
          ? draft.claude_code_session_url
          : undefined,
    },
  };
}

function isRoutineSessionDraft(draft: DirectoryDraftContent): boolean {
  return Boolean(draft.claude_code_session_url);
}

/** Review panel shown after a daemon session stops — lets the user edit and confirm apontamentos. */
export function DaemonDraftReview({ sessionId, drafts, orgId, userId, onComplete }: Props) {
  const typed = useMemo(() => drafts.map(castDraft), [drafts]);

  const [contents, setContents] = useState<Record<string, string>>(
    Object.fromEntries(typed.map((d) => [d.dir_id, d.draft.content])),
  );
  const [hours, setHours] = useState<Record<string, number>>(
    Object.fromEntries(typed.map((d) => [d.dir_id, d.draft.hours_worked])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().split("T")[0];
    const toCreate = typed.filter(
      (d) => totalChanges(d.diff) > 0 && !isRoutineSessionDraft(d.draft),
    );

    if (toCreate.length === 0) {
      setLoading(false);
      onComplete();
      return;
    }

    let failures = 0;

    for (const d of toCreate) {
      try {
        await createApontamentoFromDraft({
          user_id: userId,
          organization_id: orgId,
          session_id: sessionId,
          date: today,
          content: contents[d.dir_id] ?? "",
          hours_worked: hours[d.dir_id] ?? 0.25,
        });
      } catch {
        failures++;
      }
    }

    setLoading(false);
    if (failures > 0) {
      setError(
        `${failures} de ${toCreate.length} apontamento${toCreate.length > 1 ? "s" : ""} não pôde ser criado. Tente confirmar novamente.`,
      );
    } else {
      onComplete();
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-lg border border-copper/30 bg-surface p-4">
      <h2 className="text-base font-semibold">Revisar apontamentos gerados</h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {typed.map((d) => (
        <div key={d.dir_id} className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{d.path}</p>
            <p className="text-sm">{d.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.diff.created.length} criados · {d.diff.modified.length} modificados ·{" "}
              {d.diff.deleted.length} deletados
            </p>
          </div>
          {isRoutineSessionDraft(d.draft) ? (
            <div className="rounded-md border border-copper/30 bg-copper-soft/40 px-3 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Routine disparada no Claude Code</p>
              <p className="mt-1">
                O daemon enviou o contexto para a routine e recebeu uma sessao do Claude Code em vez
                de um draft pronto para edicao.
              </p>
              <a
                href={d.draft.claude_code_session_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-md border border-copper/40 px-3 py-1.5 text-sm font-medium text-copper hover:bg-copper-soft"
              >
                Abrir chat da routine
              </a>
              {d.draft.claude_code_session_id ? (
                <p className="mt-2 font-mono text-xs opacity-70">
                  Sessao: {d.draft.claude_code_session_id}
                </p>
              ) : null}
            </div>
          ) : totalChanges(d.diff) > 0 ? (
            <>
              <textarea
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-copper"
                rows={5}
                value={contents[d.dir_id] ?? ""}
                onChange={(e) => setContents((prev) => ({ ...prev, [d.dir_id]: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Horas:</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-copper"
                  value={hours[d.dir_id] ?? 0.25}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setHours((prev) => ({ ...prev, [d.dir_id]: isNaN(val) ? 0.25 : val }));
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Sem alterações — nenhum apontamento será criado.
            </p>
          )}
        </div>
      ))}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="rounded-md bg-copper px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading
            ? "Processando..."
            : typed.some((d) => !isRoutineSessionDraft(d.draft) && totalChanges(d.diff) > 0)
              ? "Confirmar e criar apontamentos"
              : "Fechar"}
        </button>
        <button
          onClick={onComplete}
          disabled={loading}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
