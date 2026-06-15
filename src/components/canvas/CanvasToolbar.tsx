import { Pencil, MousePointer } from "lucide-react"

const COLORS = ["#1a1a1a", "#EA580C", "#0f766e", "#2563eb", "#dc2626", "#7c3aed"]
const WIDTHS = [2, 4, 8]

type Props = {
  isDrawing: boolean
  color: string
  strokeWidth: number
  onToggleDraw: () => void
  onColorChange: (c: string) => void
  onWidthChange: (w: number) => void
}

/** Floating toolbar for toggling draw mode, picking color and stroke width. */
export function CanvasToolbar({ isDrawing, color, strokeWidth, onToggleDraw, onColorChange, onWidthChange }: Props) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-md">
      <button
        onClick={onToggleDraw}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          isDrawing ? "bg-copper text-white" : "text-muted-foreground hover:bg-background"
        }`}
        title={isDrawing ? "Modo cursor" : "Modo desenho"}
      >
        {isDrawing ? <Pencil className="h-4 w-4" /> : <MousePointer className="h-4 w-4" />}
      </button>

      {isDrawing && (
        <>
          <div className="h-4 w-px bg-border" />
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-1 ring-copper" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <div className="h-4 w-px bg-border" />
          {WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => onWidthChange(w)}
              className={`flex h-6 w-6 items-center justify-center rounded ${strokeWidth === w ? "bg-copper-soft" : "hover:bg-background"}`}
            >
              <div className="rounded-full bg-foreground" style={{ width: w * 2, height: w * 2 }} />
            </button>
          ))}
        </>
      )}
    </div>
  )
}
