import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";
import { CanvasConnectionHandles } from "@/components/canvas/CanvasConnectionHandles";
import { InlineTodoCard } from "@/components/canvas/InlineTodoCard";
import {
  normalizeTextContent,
  removeDeletedLineAnchors,
  type TextBlockContent,
  type TodoBlockContent,
} from "@/lib/notes-model";

type AnchoredTodoView = {
  blockId: string;
  lineId: string;
  content: TodoBlockContent;
};

export type TextNodeData = {
  content: TextBlockContent;
  anchoredTodos: AnchoredTodoView[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: TextBlockContent, detachedTodoIds: string[]) => void;
  onTodoContentChange: (blockId: string, content: TodoBlockContent) => void;
  onTodoTaskStatusChange: (
    taskId: string,
    taskType: "personal" | "org",
    status: "queued" | "in_progress" | "completed",
  ) => void;
  onRequestUnanchorTodo: (blockId: string) => void;
  onOpenPopup: (id: string) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
};

export const TextNoteNode = memo(function TextNoteNode({ id, data, selected }: NodeProps) {
  const typedData = data as unknown as TextNodeData;
  const [content, setContent] = useState<TextBlockContent>(typedData.content);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [textareaHeight, setTextareaHeight] = useState(112);

  useEffect(() => {
    setContent(typedData.content);
  }, [typedData.content]);

  const hasAnchoredTodos = typedData.anchoredTodos.length > 0;

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (hasAnchoredTodos) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.max(textarea.scrollHeight, 112);
    textarea.style.height = `${nextHeight}px`;
    setTextareaHeight(nextHeight);
  }, [content.text, hasAnchoredTodos]);

  useEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    const body = bodyRef.current;
    if (!root || !header || !body) return;

    const currentHeight = root.getBoundingClientRect().height;
    const targetHeight = Math.max(
      header.getBoundingClientRect().height + body.scrollHeight,
      140,
    );

    if (targetHeight > currentHeight + 1) {
      typedData.onResizeEnd(id, root.getBoundingClientRect().width, targetHeight);
    }
  }, [content, hasAnchoredTodos, id, textareaHeight, typedData]);

  function persist(nextContent: TextBlockContent, previousLines: TextBlockContent["lines"] = content.lines) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const normalized = normalizeTextContent(nextContent.text, nextContent.lines);
      const cleanup = removeDeletedLineAnchors(previousLines, normalized.lines);
      typedData.onUpdate(id, normalized, cleanup.detachedTodoIds);
    }, 250);
  }

  function updateLines(
    updater: (lines: TextBlockContent["lines"]) => TextBlockContent["lines"],
    options?: { skipPersist?: boolean },
  ) {
    setContent((current) => {
      const nextLines = updater(current.lines);
      const nextContent = {
        text: nextLines.map((line) => line.text).join("\n"),
        lines: nextLines,
      };
      if (!options?.skipPersist) persist(nextContent, current.lines);
      return nextContent;
    });
  }

  return (
    <div
      ref={rootRef}
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

      <div
        ref={headerRef}
        className="flex items-center justify-between border-b border-border px-3 py-1.5 cursor-grab active:cursor-grabbing"
      >
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

      <div ref={bodyRef} className="relative flex-1 overflow-visible">
        {hasAnchoredTodos ? (
          <div className="px-3 py-2">
            {content.lines.map((line, index) => {
              const anchoredTodo = typedData.anchoredTodos.find((entry) => entry.lineId === line.id);
              return (
                <div key={line.id} className="space-y-1">
                  <div
                    data-note-line-id={line.id}
                    contentEditable
                    suppressContentEditableWarning
                    className="nopan nodrag min-h-7 whitespace-pre-wrap break-words rounded text-sm text-foreground focus:outline-none"
                    onInput={(event) => {
                      const nextText = event.currentTarget.textContent ?? "";
                      updateLines((lines) =>
                        lines.map((entry) =>
                          entry.id === line.id ? { ...entry, text: nextText } : entry,
                        ),
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        updateLines((lines) => {
                          const currentIndex = lines.findIndex((entry) => entry.id === line.id);
                          const nextLine = {
                            id: crypto.randomUUID(),
                            text: "",
                            anchorTodoBlockId: null,
                          };
                          return [
                            ...lines.slice(0, currentIndex + 1),
                            nextLine,
                            ...lines.slice(currentIndex + 1),
                          ];
                        });
                        return;
                      }

                      if (
                        event.key === "Backspace" &&
                        line.text.length === 0 &&
                        !line.anchorTodoBlockId &&
                        content.lines.length > 1
                      ) {
                        event.preventDefault();
                        updateLines((lines) => lines.filter((entry) => entry.id !== line.id));
                      }
                    }}
                  >
                    {line.text}
                  </div>

                  {anchoredTodo ? (
                    <InlineTodoCard
                      blockId={anchoredTodo.blockId}
                      content={anchoredTodo.content}
                      onContentChange={typedData.onTodoContentChange}
                      onTaskStatusChange={typedData.onTodoTaskStatusChange}
                      onRequestUnanchor={typedData.onRequestUnanchorTodo}
                      onOpenPopup={typedData.onOpenPopup}
                    />
                  ) : null}

                  {index === content.lines.length - 1 && content.text.length === 0 ? (
                    <span className="pointer-events-none text-sm text-muted-foreground">
                      Escreva aqui...
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {content.text.length === 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground select-none"
              >
                Escreva aqui...
              </span>
            )}
            <textarea
              ref={textareaRef}
              className="nopan nodrag block w-full resize-none overflow-hidden bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none"
              style={{ minHeight: `${textareaHeight}px`, height: `${textareaHeight}px` }}
              value={content.text}
              onChange={(event) => {
                const nextContent = normalizeTextContent(event.target.value, content.lines);
                setContent(nextContent);
                persist(nextContent, content.lines);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
});
