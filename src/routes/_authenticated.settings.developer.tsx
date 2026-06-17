import { useState, useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/AppShell"

const DAEMON_URL = "http://localhost:7432"

type WatchedDir = {
  id: string
  path: string
  description: string
  snapshot_exists: boolean
  created_at: string
}

type DaemonErrorResponse = {
  detail?: string
}

export const Route = createFileRoute("/_authenticated/settings/developer")({
  head: () => ({
    meta: [
      { title: "Configurações de Desenvolvedor — Marco" },
      { name: "description", content: "Gerencie diretórios monitorados pelo daemon." },
    ],
  }),
  component: DeveloperSettingsPage,
})

function DeveloperSettingsPage() {
  const [dirs, setDirs] = useState<WatchedDir[]>([])
  const [daemonOnline, setDaemonOnline] = useState(false)
  const [newPath, setNewPath] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDirs = async (): Promise<void> => {
    try {
      const resp = await fetch(`${DAEMON_URL}/directories`)
      if (!resp.ok) {
        setDaemonOnline(false)
        return
      }
      setDaemonOnline(true)
      const data: WatchedDir[] = await resp.json()
      setDirs(data)
    } catch {
      setDaemonOnline(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDirs()
  }, [])

  const addDir = async (): Promise<void> => {
    setError(null)
    try {
      const resp = await fetch(`${DAEMON_URL}/directories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath, description: newDesc }),
      })
      if (!resp.ok) {
        const data: DaemonErrorResponse = await resp.json()
        setError(data.detail ?? "Erro ao adicionar diretório")
        return
      }
      setNewPath("")
      setNewDesc("")
      await fetchDirs()
    } catch {
      setError("Erro ao conectar com o daemon")
    }
  }

  const updateDir = async (id: string): Promise<void> => {
    try {
      await fetch(`${DAEMON_URL}/directories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDesc }),
      })
      setEditingId(null)
      await fetchDirs()
    } catch {
      setError("Erro ao atualizar diretório")
    }
  }

  const removeDir = async (id: string): Promise<void> => {
    try {
      await fetch(`${DAEMON_URL}/directories/${id}`, { method: "DELETE" })
      await fetchDirs()
    } catch {
      setError("Erro ao remover diretório")
    }
  }

  const startEdit = (dir: WatchedDir): void => {
    setEditingId(dir.id)
    setEditDesc(dir.description)
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Configurações de Desenvolvedor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Diretórios monitorados para detecção de arquivos alterados durante sessões.
          </p>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${daemonOnline ? "bg-green-500" : "bg-muted-foreground"}`}
          />
          <span className="text-xs text-muted-foreground">
            {loading
              ? "Verificando daemon..."
              : daemonOnline
                ? "Daemon online"
                : "Daemon offline"}
          </span>
        </div>

        {!loading && !daemonOnline && (
          <div className="mb-8 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm font-medium text-foreground">Daemon não detectado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Inicie o workstream-daemon e recarregue a página:
            </p>
            <pre className="mt-3 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              python -m daemon
            </pre>
          </div>
        )}

        {daemonOnline && (
          <>
            <div className="mb-8 space-y-3">
              {dirs.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum diretório cadastrado
                </div>
              )}
              {dirs.map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">{d.path}</p>
                      {editingId === d.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-copper focus:outline-none"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            aria-label="Descrição do diretório"
                            autoFocus
                          />
                          <button
                            onClick={() => updateDir(d.id)}
                            className="rounded-md bg-copper px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {d.description || <span className="italic">Sem descrição</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => startEdit(d)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => removeDir(d.id)}
                        className="text-xs text-destructive hover:text-destructive/80"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {d.snapshot_exists && (
                    <p className="mt-2 text-[11px] text-muted-foreground/60">
                      Snapshot disponível
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-medium">Adicionar diretório</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Caminho absoluto
                  </label>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-copper focus:outline-none"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    aria-label="Caminho absoluto do diretório"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Descrição do projeto
                  </label>
                  <textarea
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
                    rows={2}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    aria-label="Descrição do projeto"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button
                  onClick={addDir}
                  disabled={!newPath.trim()}
                  className="rounded-md bg-copper px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
