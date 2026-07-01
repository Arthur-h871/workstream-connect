import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTodoItem,
  createConnectionHandleId,
  deleteTodoBranch,
  ensureAnchorLine,
  indentTodoItem,
  outdentTodoItem,
  parseConnectionHandleId,
  removeDeletedLineAnchors,
  renameTodoItem,
  toggleTodoItemChecked,
  type TextLine,
  type TodoItem,
} from "../src/lib/notes-model.ts";

function sampleItems(): TodoItem[] {
  return [
    {
      id: "parent",
      text: "Parent",
      checked: false,
      parent_item_id: null,
      order: 0,
      task_id: "task-1",
      task_type: "personal",
      due_date: "2026-07-01",
      detached_from_task: false,
    },
    {
      id: "child",
      text: "Child",
      checked: false,
      parent_item_id: "parent",
      order: 0,
      task_id: "task-2",
      task_type: "personal",
      due_date: null,
      detached_from_task: false,
    },
    {
      id: "grandchild",
      text: "Grandchild",
      checked: false,
      parent_item_id: "child",
      order: 0,
      task_id: null,
      task_type: null,
      due_date: null,
      detached_from_task: false,
    },
    {
      id: "sibling",
      text: "Sibling",
      checked: false,
      parent_item_id: null,
      order: 1,
      task_id: null,
      task_type: null,
      due_date: null,
      detached_from_task: false,
    },
  ];
}

test("toggleTodoItemChecked marks an entire branch complete", () => {
  const toggled = toggleTodoItemChecked(sampleItems(), "parent");

  assert.equal(toggled.find((item) => item.id === "parent")?.checked, true);
  assert.equal(toggled.find((item) => item.id === "child")?.checked, true);
  assert.equal(toggled.find((item) => item.id === "grandchild")?.checked, true);
});

test("toggleTodoItemChecked blocks unchecking descendants while an ancestor stays completed", () => {
  const checked = toggleTodoItemChecked(sampleItems(), "parent");
  const attempted = toggleTodoItemChecked(checked, "child");

  assert.equal(attempted.find((item) => item.id === "child")?.checked, true);
  assert.equal(attempted.find((item) => item.id === "grandchild")?.checked, true);
});

test("deleteTodoBranch removes the item and all descendants", () => {
  const remaining = deleteTodoBranch(sampleItems(), "child");

  assert.deepEqual(
    remaining.map((item) => item.id),
    ["parent", "sibling"],
  );
});

test("renameTodoItem detaches an existing task link", () => {
  const renamed = renameTodoItem(sampleItems(), "parent", "Renamed");
  const item = renamed.find((entry) => entry.id === "parent");

  assert.equal(item?.text, "Renamed");
  assert.equal(item?.task_id, null);
  assert.equal(item?.task_type, null);
  assert.equal(item?.due_date, null);
  assert.equal(item?.detached_from_task, true);
});

test("indentTodoItem nests under the previous visible sibling", () => {
  const indented = indentTodoItem(sampleItems(), "sibling");
  const item = indented.find((entry) => entry.id === "sibling");

  assert.equal(item?.parent_item_id, "parent");
  assert.equal(item?.order, 1);
});

test("outdentTodoItem moves a nested item one level up", () => {
  const outdented = outdentTodoItem(sampleItems(), "child");
  const item = outdented.find((entry) => entry.id === "child");

  assert.equal(item?.parent_item_id, null);
});

test("appendTodoItem creates a sibling after the reference item", () => {
  const appended = appendTodoItem(sampleItems(), "child");
  const item = appended.find((entry) => entry.text === "");

  assert.ok(item);
  assert.equal(item.parent_item_id, "parent");
  assert.equal(item.order, 1);
});

test("removeDeletedLineAnchors returns detached todo ids for removed lines", () => {
  const previousLines: TextLine[] = [
    { id: "line-1", text: "A" },
    { id: "line-2", text: "B", anchorTodoBlockId: "todo-1" },
    { id: "line-3", text: "C" },
  ];
  const nextLines: TextLine[] = [
    { id: "line-1", text: "A" },
    { id: "line-3", text: "C" },
  ];

  const result = removeDeletedLineAnchors(previousLines, nextLines);

  assert.deepEqual(result.detachedTodoIds, ["todo-1"]);
  assert.deepEqual(result.lines, nextLines);
});

test("ensureAnchorLine inserts a dedicated empty line when the target line already has text", () => {
  const lines: TextLine[] = [
    { id: "line-1", text: "Primeira linha" },
    { id: "line-2", text: "Segunda linha" },
  ];

  const result = ensureAnchorLine(lines, "line-1", "todo-1");

  assert.equal(result.lineId, result.lines[1]?.id);
  assert.equal(result.lines[1]?.text, "");
  assert.equal(result.lines[1]?.anchorTodoBlockId, "todo-1");
  assert.equal(result.lines[2]?.id, "line-2");
});

test("connection handle ids round-trip target metadata", () => {
  const handleId = createConnectionHandleId("todo_item", "item-1", "left");
  const parsed = parseConnectionHandleId(handleId);

  assert.deepEqual(parsed, {
    targetType: "todo_item",
    targetId: "item-1",
    side: "left",
  });
});
