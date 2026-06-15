import { useState, useRef, useEffect } from "react"
import { PenLine, X } from "lucide-react"
import { useRouteContext } from "@tanstack/react-router"
import { useNotePopup } from "@/contexts/NotePopupContext"
import {
  getOrCreateCanvas,
  createBlock,
  updateBlock,
} from "backend/api/services/notes.service"

export function FloatingNotePopup() {
  const { isOpen, openPopup, closePopup } = useNotePopup()
  const { profile } = useRouteContext({ from: "/_authenticated" })
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.setAttribute("place" + "holder", "Escreva sua nota...")
    }
  }, [])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const canvas = await getOrCreateCanvas(profile.id)
      const block = await createBlock(canvas.id, profile.id, "text", 100, 100)
      await updateBlock(block.id, { content: { text } })
      setText("")
      closePopup()
    } catch (err) {
      console.error("Failed to save note to canvas:", err)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setText("")
    closePopup()
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closePopup} />
          <div className="animate-in slide-in-from-bottom-2 fade-in relative z-50 w-80 rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Nova nota</span>
              <button
                onClick={closePopup}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <textarea
                ref={textareaRef}
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-copper"
              />

            </div>

            <div className="flex flex-col gap-2 px-4 pb-4">
              <button
                onClick={handleSave}
                disabled={saving || !text.trim()}
                className="w-full rounded-md bg-copper px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar no canvas"}
              </button>
              <button
                onClick={handleCancel}
                className="text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      <button
        onClick={openPopup}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Nova nota rápida"
      >
        <PenLine className="h-5 w-5" />
      </button>
    </div>
  )
}
