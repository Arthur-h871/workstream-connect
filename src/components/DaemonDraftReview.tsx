import { useState } from "react";
import { createApontamentoFromDraft } from "backend/api/services/apontamentos.service";

type DirectoryDiff = {
  created: string[];
  modified: string[];
  deleted: string[];
};

type DirectoryDraftContent = {
  content: string;
  hours_worked: number;
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
      hours_worked: Number(draft.hours_worked ?? 0.25),
    },
  };
}

/** Review panel shown after a daemon session stops — lets the user edit and confirm apontamentos. */
export function DaemonDraftReview({ sessionId, drafts, orgId, userId, onComplete }: Props) {
  const typed = drafts.map(castDraft);

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
    try {
      for (const d of typed) {
        if (totalChanges(d.diff) === 0) continue;
        await createApontamentoFromDraft({
          user_id: userId,
          organization_id: orgId,
          session_id: sessionId,
          date: today,
          content: contents[d.dir_id] ?? "",
          hours_worked: hours[d.dir_id] ?? 0.25,
        });
      }
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar apontamentos.");
    } finally {
      setLoading(false);
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
          {totalChanges(d.diff) > 0 ? (
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
                  onChange={(e) =>
                    setHours((prev) => ({ ...prev, [d.dir_id]: parseFloat(e.target.value) }))
                  }
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
          {loading ? "Criando..." : "Confirmar e criar apontamentos"}
        </button>
        <button
          onClick={onComplete}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
