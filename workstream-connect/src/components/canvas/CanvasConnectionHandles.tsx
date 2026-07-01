import { Handle, Position } from "@xyflow/react";
import { createConnectionHandleId, type NoteConnectionTargetType } from "@/lib/notes-model";

type Props = {
  nodeId: string;
  targetType?: NoteConnectionTargetType;
};

const HANDLE_CLASS =
  "h-3 w-3 rounded-full border border-copper bg-background opacity-100 transition-transform hover:scale-110";

export function CanvasConnectionHandles({ nodeId, targetType = "block" }: Props) {
  return (
    <>
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "top")}
        type="target"
        position={Position.Top}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "top")}
        type="source"
        position={Position.Top}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "right")}
        type="target"
        position={Position.Right}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "right")}
        type="source"
        position={Position.Right}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "bottom")}
        type="target"
        position={Position.Bottom}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "bottom")}
        type="source"
        position={Position.Bottom}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "left")}
        type="target"
        position={Position.Left}
        className={HANDLE_CLASS}
      />
      <Handle
        id={createConnectionHandleId(targetType, nodeId, "left")}
        type="source"
        position={Position.Left}
        className={HANDLE_CLASS}
      />
    </>
  );
}
