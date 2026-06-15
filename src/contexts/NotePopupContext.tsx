import { createContext, useContext, useState, type ReactNode } from "react"

type NotePopupContextValue = {
  isOpen: boolean
  openPopup: () => void
  closePopup: () => void
}

const NotePopupContext = createContext<NotePopupContextValue | null>(null)

export function NotePopupProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <NotePopupContext.Provider value={{ isOpen, openPopup: () => setIsOpen(true), closePopup: () => setIsOpen(false) }}>
      {children}
    </NotePopupContext.Provider>
  )
}

export function useNotePopup() {
  const ctx = useContext(NotePopupContext)
  if (!ctx) throw new Error("useNotePopup must be used within NotePopupProvider")
  return ctx
}
