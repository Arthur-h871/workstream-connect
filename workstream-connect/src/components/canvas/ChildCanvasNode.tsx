import { memo, useEffect, useRef, useState } from "react";
import { Folder, ImagePlus, LayoutGrid, Lightbulb, Map, Maximize2, StickyNote, Trash2 } from "lucide-react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { CanvasConnectionHandles } from "@/components/canvas/CanvasConnectionHandles";

const PRESET_ICONS = [
  { value: "folder", icon: Folder },
  { value: "board", icon: LayoutGrid },
  { value: "map", icon: Map },
  { value: "note", icon: StickyNote },
  { value: "idea", icon: Lightbulb },
];

export type ChildCanvasNodeData = {
  canvasId: string;
  title: string;
  iconType: "preset" | "image";
  iconValue: string | null;
  iconAssetUrl: string | null;
  onDelete: (blockId: string, canvasId: string) => void;
  onOpenCanvas: (canvasId: string) => void;
  onRename: (blockId: string, canvasId: string, title: string) => void;
  onPresetIconChange: (
    blockId: string,
    canvasId: string,
    iconValue: string,
  ) => void;
  onUploadIcon: (blockId: string, canvasId: string, file: File) => void;
  onOpenPopup: (blockId: string) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
};

function presetIconFor(value: string | null) {
  return PRESET_ICONS.find((preset) => preset.value === value)?.icon ?? Folder;
}

export const ChildCanvasNode = memo(function ChildCanvasNode({
  id,
  data,
  selected,
}: NodeProps) {
  const typedData = data as unknown as ChildCanvasNodeData;
  const [title, setTitle] = useState(typedData.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const PresetIcon = presetIconFor(typedData.iconValue);

  useEffect(() => {
    setTitle(typedData.title);
  }, [typedData.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div
      className={`flex h-full w-full flex-col rounded-2xl border bg-surface shadow-sm ${
        selected ? "border-copper" : "border-border"
      }`}
      onDoubleClick={() => typedData.onOpenCanvas(typedData.canvasId)}
    >
      <NodeResizer
        minWidth={190}
        minHeight={110}
        isVisible={selected}
        onResizeEnd={(_, params) => typedData.onResizeEnd(id, params.width, params.height)}
      />
      <CanvasConnectionHandles nodeId={id} />

      <div className="flex items-center justify-between border-b border-border px-3 py-2 cursor-grab active:cursor-grabbing">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Canvas filho
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => typedData.onOpenPopup(id)}
            className="nopan nodrag rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => typedData.onDelete(id, typedData.canvasId)}
            className="nopan nodrag rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 px-3 py-3">
        <div className="flex w-14 flex-col items-center gap-2">
          <button
            onClick={() => {
              const index = PRESET_ICONS.findIndex((preset) => preset.value === typedData.iconValue);
              const nextPreset = PRESET_ICONS[(index + 1 + PRESET_ICONS.length) % PRESET_ICONS.length];
              typedData.onPresetIconChange(id, typedData.canvasId, nextPreset.value);
            }}
            className="nopan nodrag flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background"
          >
            {typedData.iconType === "image" && typedData.iconAssetUrl ? (
              <img
                src={typedData.iconAssetUrl}
                alt={typedData.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <PresetIcon className="h-5 w-5 text-copper" />
            )}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="nopan nodrag flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ImagePlus className="h-3 w-3" />
            Imagem
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              typedData.onUploadIcon(id, typedData.canvasId, file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <input
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => {
                typedData.onRename(id, typedData.canvasId, nextTitle || "Novo canvas");
              }, 500);
            }}
            className="nopan nodrag rounded bg-transparent text-base font-semibold text-foreground outline-none"
          />
          <p className="text-xs text-muted-foreground">
            Duplo clique para entrar neste canvas
          </p>
        </div>
      </div>
    </div>
  );
});
