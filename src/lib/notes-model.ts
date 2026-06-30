export type NoteBlockType = "text" | "todo" | "task_ref" | "child_canvas";
export type NoteConnectionTargetType = "block" | "todo_item" | "todo_anchor";
export type NoteConnectionSide = "top" | "right" | "bottom" | "left";

export type TodoItem = {
  id: string;
  text: string;
  checked: boolean;
  parent_item_id: string | null;
  order: number;
  task_id: string | null;
  task_type: "personal" | "org" | null;
  due_date: string | null;
  detached_from_task: boolean;
};

export type TextLine = {
  id: string;
  text: string;
  anchorTodoBlockId?: string | null;
};

export type TextBlockContent = {
  text: string;
  lines: TextLine[];
};

export type TodoBlockContent = {
  items: TodoItem[];
  anchor: {
    textBlockId: string | null;
    lineId: string | null;
  };
};

type AnchorCleanupResult = {
  lines: TextLine[];
  detachedTodoIds: string[];
};

function cloneItems(items: TodoItem[]): TodoItem[] {
  return items.map((item) => ({ ...item }));
}

function sortItems(items: TodoItem[]): TodoItem[] {
  return [...items].sort((left, right) => {
    if (left.parent_item_id === right.parent_item_id) {
      return left.order - right.order;
    }
    return left.order - right.order;
  });
}

function getChildren(items: TodoItem[], parentId: string | null): TodoItem[] {
  return sortItems(items).filter((item) => item.parent_item_id === parentId);
}

function collectDescendantIds(items: TodoItem[], itemId: string): Set<string> {
  const ids = new Set<string>([itemId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (!ids.has(item.id) && item.parent_item_id && ids.has(item.parent_item_id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

function hasCompletedAncestor(items: TodoItem[], itemId: string): boolean {
  const byId = new Map(items.map((item) => [item.id, item]));
  let current = byId.get(itemId);
  while (current?.parent_item_id) {
    current = byId.get(current.parent_item_id);
    if (current?.checked) return true;
  }
  return false;
}

function nextSiblingOrder(items: TodoItem[], parentId: string | null): number {
  const siblings = items.filter((item) => item.parent_item_id === parentId);
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((item) => item.order)) + 1;
}

export function normalizeTextContent(text: string, previousLines: TextLine[] = []): TextBlockContent {
  const segments = text.split("\n");
  const previousByIndex = previousLines;
  const lines = segments.map((segment, index) => ({
    id: previousByIndex[index]?.id ?? crypto.randomUUID(),
    text: segment,
    anchorTodoBlockId: previousByIndex[index]?.anchorTodoBlockId ?? null,
  }));
  return { text, lines };
}

export function removeDeletedLineAnchors(
  previousLines: TextLine[],
  nextLines: TextLine[],
): AnchorCleanupResult {
  const nextIds = new Set(nextLines.map((line) => line.id));
  const detachedTodoIds = previousLines
    .filter((line) => !nextIds.has(line.id) && line.anchorTodoBlockId)
    .map((line) => line.anchorTodoBlockId as string);

  return { lines: nextLines, detachedTodoIds };
}

export function toggleTodoItemChecked(items: TodoItem[], itemId: string): TodoItem[] {
  const next = cloneItems(items);
  const target = next.find((item) => item.id === itemId);
  if (!target) return next;

  if (target.checked) {
    if (hasCompletedAncestor(next, itemId)) {
      return next;
    }
    target.checked = false;
    return next;
  }

  const branchIds = collectDescendantIds(next, itemId);
  return next.map((item) => (branchIds.has(item.id) ? { ...item, checked: true } : item));
}

export function deleteTodoBranch(items: TodoItem[], itemId: string): TodoItem[] {
  const ids = collectDescendantIds(items, itemId);
  return items.filter((item) => !ids.has(item.id));
}

export function renameTodoItem(items: TodoItem[], itemId: string, text: string): TodoItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    if (!item.task_id) return { ...item, text };
    return {
      ...item,
      text,
      task_id: null,
      task_type: null,
      due_date: null,
      detached_from_task: true,
    };
  });
}

export function indentTodoItem(items: TodoItem[], itemId: string): TodoItem[] {
  const next = cloneItems(items);
  const target = next.find((item) => item.id === itemId);
  if (!target) return next;

  const previousSibling = next
    .filter(
      (item) =>
        item.parent_item_id === target.parent_item_id &&
        item.order < target.order &&
        item.id !== target.id,
    )
    .sort((left, right) => right.order - left.order)[0];

  if (!previousSibling) return next;

  target.parent_item_id = previousSibling.id;
  target.order = nextSiblingOrder(next.filter((item) => item.id !== target.id), previousSibling.id);
  return next;
}

export function outdentTodoItem(items: TodoItem[], itemId: string): TodoItem[] {
  const next = cloneItems(items);
  const byId = new Map(next.map((item) => [item.id, item]));
  const target = byId.get(itemId);
  if (!target?.parent_item_id) return next;

  const parent = byId.get(target.parent_item_id);
  target.parent_item_id = parent?.parent_item_id ?? null;
  target.order = nextSiblingOrder(next.filter((item) => item.id !== target.id), target.parent_item_id);
  return next;
}

export function appendTodoItem(items: TodoItem[], itemId: string | null): TodoItem[] {
  const next = cloneItems(items);
  const current = itemId ? next.find((item) => item.id === itemId) ?? null : null;
  const parentId = current?.parent_item_id ?? null;
  const order = current ? current.order + 1 : nextSiblingOrder(next, parentId);

  for (const item of next) {
    if (item.parent_item_id === parentId && item.order >= order) {
      item.order += 1;
    }
  }

  next.push({
    id: crypto.randomUUID(),
    text: "",
    checked: false,
    parent_item_id: parentId,
    order,
    task_id: null,
    task_type: null,
    due_date: null,
    detached_from_task: false,
  });

  return next;
}

export function getTodoDepth(items: TodoItem[], itemId: string): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  let depth = 0;
  let current = byId.get(itemId);
  while (current?.parent_item_id) {
    depth += 1;
    current = byId.get(current.parent_item_id);
  }
  return depth;
}

export function getTodoBranchIds(items: TodoItem[], itemId: string): Set<string> {
  return collectDescendantIds(items, itemId);
}

export function isTodoAnchored(content: TodoBlockContent): boolean {
  return Boolean(content.anchor.textBlockId && content.anchor.lineId);
}

export function createEmptyTodoContent(): TodoBlockContent {
  return {
    items: [],
    anchor: { textBlockId: null, lineId: null },
  };
}

export function createEmptyTextContent(): TextBlockContent {
  return normalizeTextContent("");
}

export function attachTodoToLine(lines: TextLine[], lineId: string, todoBlockId: string): TextLine[] {
  return lines.map((line) => ({
    ...line,
    anchorTodoBlockId: line.id === lineId ? todoBlockId : line.anchorTodoBlockId ?? null,
  }));
}

export function detachTodoFromLines(lines: TextLine[], todoBlockId: string): TextLine[] {
  return lines.map((line) =>
    line.anchorTodoBlockId === todoBlockId ? { ...line, anchorTodoBlockId: null } : line,
  );
}

export function listAnchoredTodoIds(lines: TextLine[]): string[] {
  return lines
    .map((line) => line.anchorTodoBlockId)
    .filter((value): value is string => Boolean(value));
}

export function createConnectionHandleId(
  targetType: NoteConnectionTargetType,
  targetId: string,
  side: NoteConnectionSide,
): string {
  return `${targetType}:${targetId}:${side}`;
}

export function parseConnectionHandleId(handleId: string | null | undefined): {
  targetType: NoteConnectionTargetType;
  targetId: string;
  side: NoteConnectionSide;
} {
  const [targetType = "block", targetId = "", side = "right"] = (handleId ?? "").split(":");
  return {
    targetType: targetType as NoteConnectionTargetType,
    targetId,
    side: side as NoteConnectionSide,
  };
}
