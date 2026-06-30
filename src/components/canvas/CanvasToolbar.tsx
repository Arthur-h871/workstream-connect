import { useEffect, useState } from "react";
import {
  CheckSquare,
  Eraser,
  FolderPlus,
  MousePointer,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
} from "lucide-react";

const COLORS = ["#1a1a1a", "#EA580C", "#0f766e", "#2563eb", "#dc2626", "#7c3aed"];
const WIDTHS = [2, 4, 8];

type Props = {
  canCreateNote: boolean;
  canUseCanvasTools: boolean;
  isDrawing: boolean;
  isErasing: boolean;
  color: string;
  strokeWidth: number;
  onCreateNote: () => void;
  onCreateTodo: () => void;
  onCreateChildCanvas: () => void;
  onUsePointer: () => void;
  onToggleDraw: () => void;
  onToggleErase: () => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
};

type PanelView = "notes" | "draw" | "erase";

/** Floating dock with a compact rail and a contextual panel that overlays the canvas. */
export function CanvasToolbar({
  canCreateNote,
  canUseCanvasTools,
  isDrawing,
  isErasing,
  color,
  strokeWidth,
  onCreateNote,
  onCreateTodo,
  onCreateChildCanvas,
  onUsePointer,
  onToggleDraw,
  onToggleErase,
  onColorChange,
  onWidthChange,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelView, setPanelView] = useState<PanelView>("notes");

  useEffect(() => {
    if (isDrawing) {
      setPanelView("draw");
      setPanelOpen(true);
      return;
    }

    if (isErasing) {
      setPanelView("erase");
      setPanelOpen(true);
    }
  }, [isDrawing, isErasing]);

  return (
    <div className="absolute left-4 top-4 z-20 flex items-start gap-3">
      <div
        data-dock-rail
        className="flex flex-col gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-lg backdrop-blur"
      >
        <button
          onClick={() => {
            setPanelView("notes");
            onCreateNote();
          }}
          disabled={!canCreateNote}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          title="Nova nota"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            setPanelView("notes");
            onUsePointer();
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
            !isDrawing && !isErasing
              ? "bg-copper text-primary-foreground"
              : "text-muted-foreground hover:bg-background"
          }`}
          title="Modo selecao"
        >
          <MousePointer className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            if (!canUseCanvasTools) return;
            setPanelView("draw");
            onToggleDraw();
          }}
          disabled={!canUseCanvasTools}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
            isDrawing ? "bg-copper text-primary-foreground" : "text-muted-foreground hover:bg-background"
          } disabled:cursor-not-allowed disabled:opacity-40`}
          title={isDrawing ? "Sair do desenho" : "Desenhar"}
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            if (!canUseCanvasTools) return;
            setPanelView("erase");
            onToggleErase();
          }}
          disabled={!canUseCanvasTools}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
            isErasing ? "bg-copper text-primary-foreground" : "text-muted-foreground hover:bg-background"
          } disabled:cursor-not-allowed disabled:opacity-40`}
          title={isErasing ? "Sair da borracha" : "Borracha"}
        >
          <Eraser className="h-4 w-4" />
        </button>

        <button
          onClick={() => setPanelOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-background"
          title={panelOpen ? "Recolher painel" : "Abrir painel"}
        >
          {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      {panelOpen && (
        <div
          data-dock-panel
          className="min-w-[240px] rounded-2xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur"
        >
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">
              {panelView === "notes" ? "Notas" : panelView === "draw" ? "Desenho" : "Borracha"}
            </p>
            <p className="text-xs text-muted-foreground">
              {panelView === "notes"
                ? "Crie notas, listas e canvas filhos sem sair da tela imersiva."
                : panelView === "draw"
                  ? "Ajuste cor e espessura para desenhar no canvas."
                  : "Apague traços e volte ao desenho quando quiser."}
            </p>
          </div>

          {panelView === "notes" ? (
            <div className="space-y-2">
              <button
                onClick={onCreateNote}
                disabled={!canCreateNote}
                className="flex w-full items-center justify-center rounded-xl bg-copper px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Nova nota
              </button>
              <button
                onClick={onCreateTodo}
                disabled={!canCreateNote}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckSquare className="h-4 w-4" />
                Nova lista
              </button>
              <button
                onClick={onCreateChildCanvas}
                disabled={!canCreateNote}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderPlus className="h-4 w-4" />
                Canvas filho
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!canUseCanvasTools) return;
                    setPanelView("draw");
                    if (!isDrawing) onToggleDraw();
                  }}
                  disabled={!canUseCanvasTools}
                  className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isDrawing ? "bg-copper text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Desenhar
                </button>
                <button
                  onClick={() => {
                    if (!canUseCanvasTools) return;
                    setPanelView("erase");
                    if (!isErasing) onToggleErase();
                  }}
                  disabled={!canUseCanvasTools}
                  className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isErasing ? "bg-copper text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Apagar
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cor
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((swatchColor) => (
                    <button
                      key={swatchColor}
                      onClick={() => onColorChange(swatchColor)}
                      className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                        color === swatchColor ? "ring-2 ring-copper ring-offset-2 ring-offset-surface" : ""
                      }`}
                      style={{ backgroundColor: swatchColor }}
                      title={`Cor ${swatchColor}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Espessura
                </p>
                <div className="flex gap-2">
                  {WIDTHS.map((width) => (
                    <button
                      key={width}
                      onClick={() => onWidthChange(width)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                        strokeWidth === width ? "bg-copper-soft" : "bg-background hover:bg-muted"
                      }`}
                      title={`Espessura ${width}`}
                    >
                      <div
                        className="rounded-full bg-foreground"
                        style={{ width: width * 2, height: width * 2 }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
