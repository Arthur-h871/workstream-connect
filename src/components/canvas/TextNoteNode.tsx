import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Maximize2, Plus, X } from "lucide-react";
import { CanvasConnectionHandles } from "@/components/canvas/CanvasConnectionHandles";
import {
  normalizeTextContent,
  removeDeletedLineAnchors,
  type TextBlockContent,
  type TextLine,
} from "@/lib/notes-model";

const ANCHOR_PLACEHOLDER_HEIGHT = 144;

export type TextNodeData = {
  content: TextBlockContent;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: TextBlockContent, detachedTodoIds: string[]) => void;
  onOpenPopup: (id: string) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
};

function joinLines(lines: TextLine[]) {
  return lines.map((line) => line.text).join("\n");
}

export const TextNoteNode = memo(function TextNoteNode({ id, data, selected }: NodeProps) {
  const typedData = data as unknown as TextNodeData;
  const [lines, setLines] = useState<TextLine[]>(typedData.content.lines);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLines(typedData.content.lines.length > 0 ? typedData.content.lines : normalizeTextContent("").lines);
  }, [typedData.content]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const placeholderCount = useMemo(
    () => lines.filter((line) => line.anchorTodoBlockId).length,
    [lines],
  );

  function persist(nextLines: TextLine[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const normalized = normalizeTextContent(joinLines(nextLines), nextLines);
      const cleanup = removeDeletedLineAnchors(lines, normalized.lines);
      typedData.onUpdate(id, normalized, cleanup.detachedTodoIds);
    }, 250);
  }

  function updateLines(nextLines: TextLine[]) {
    setLines(nextLines);
    persist(nextLines);
  }

  return (
    <div
      className={`flex h-full w-full flex-col rounded-lg border bg-surface shadow-sm ${
        selected ? "border-copper" : "border-border"
      }`}
    >
      <NodeResizer
        minWidth={220}
        minHeight={140}
        isVisible={selected}
        onResizeEnd={(_, params) => typedData.onResizeEnd(id, params.width, params.height)}
      />
      <CanvasConnectionHandles nodeId={id} />

      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 cursor-grab active:cursor-grabbing">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Nota
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => typedData.onOpenPopup(id)}
            className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => typedData.onDelete(id)}
            className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="nopan nodrag flex-1 overflow-auto px-3 py-2">
        {lines.map((line, index) => (
          <div key={line.id} className="mb-1 rounded-md border border-transparent hover:border-border/60">
            <input
              value={line.text}
              onChange={(event) => {
                const nextLines = lines.map((entry) =>
                  entry.id === line.id ? { ...entry, text: event.target.value } : entry,
                );
                updateLines(nextLines);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const nextLine: TextLine = { id: crypto.randomUUID(), text: "" };
                const nextLines = [...lines.slice(0, index + 1), nextLine, ...lines.slice(index + 1)];
                updateLines(nextLines);
              }}
              className="w-full rounded bg-transparent px-1 py-1 text-sm text-foreground outline-none"
              placeholder={index === 0 ? "Escreva aqui..." : ""}
            />
            {line.anchorTodoBlockId && (
              <div
                data-note-line-id={line.id}
                className="mt-1 rounded-xl border border-dashed border-copper/50 bg-copper-soft/20"
                style={{ height: ANCHOR_PLACEHOLDER_HEIGHT }}
              >
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Todo list ancorada nesta linha
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => updateLines([...lines, { id: crypto.randomUUID(), text: "" }])}
          className="mt-2 flex items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Nova linha
        </button>
      </div>

      {placeholderCount === 0 && lines.length === 0 && (
        <div className="px-3 pb-3 text-sm text-muted-foreground">Escreva aqui...</div>
      )}
    </div>
  );
});

export { ANCHOR_PLACEHOLDER_HEIGHT };
