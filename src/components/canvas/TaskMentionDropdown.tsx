import { useEffect, useRef, useState } from "react"
import { User, Building2 } from "lucide-react"

type TaskResult = { id: string; title: string; type: "personal" | "org" }

type Props = {
  results: TaskResult[]
  loading: boolean
  onSelect: (item: TaskResult) => void
  onClose: () => void
}

export function TaskMentionDropdown({ results, loading, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "ArrowDown" && results.length > 0) {
        setActiveIndex(i => Math.min(i + 1, results.length - 1))
        e.preventDefault()
      }
      if (e.key === "ArrowUp" && results.length > 0) {
        setActiveIndex(i => Math.max(i - 1, 0))
        e.preventDefault()
      }
      if (e.key === "Enter" && results[activeIndex]) { onSelect(results[activeIndex]); e.preventDefault() }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [results, activeIndex, onSelect, onClose])

  useEffect(() => {
    if (!listRef.current) return
    const active = listRef.current.querySelector("[data-active='true']") as HTMLElement | null
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const personal = results.filter(r => r.type === "personal")
  const org = results.filter(r => r.type === "org")

  return (
    <div ref={listRef} className="nopan nodrag absolute z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
      {loading ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Buscando...</p>
      ) : results.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma tarefa encontrada</p>
      ) : (
        <>
          {personal.length > 0 && (
            <>
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Minhas tarefas</p>
              {personal.map((item) => (
                <ResultItem key={item.id} item={item} active={results.indexOf(item) === activeIndex} onSelect={onSelect} />
              ))}
            </>
          )}
          {org.length > 0 && (
            <>
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Da organização</p>
              {org.map((item) => (
                <ResultItem key={item.id} item={item} active={results.indexOf(item) === activeIndex} onSelect={onSelect} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

function ResultItem({ item, active, onSelect }: { item: TaskResult; active: boolean; onSelect: (i: TaskResult) => void }) {
  const Icon = item.type === "personal" ? User : Building2
  return (
    <button
      data-active={active}
      onClick={() => onSelect(item)}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${active ? "bg-copper-soft text-copper" : "hover:bg-background"}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{item.title}</span>
    </button>
  )
}
