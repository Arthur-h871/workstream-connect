import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("text note node keeps a continuous editor and supports inline anchored todos", () => {
  const source = readProjectFile("./src/components/canvas/TextNoteNode.tsx");

  assert.match(source, /<textarea/);
  assert.doesNotMatch(source, /<input/);
  assert.match(source, /contentEditable/);
  assert.match(source, /data-note-line-id/);
  assert.match(source, /InlineTodoCard/);
  assert.match(source, /textarea\.scrollHeight/);
  assert.match(source, /typedData\.onResizeEnd\(id, root\.getBoundingClientRect\(\)\.width, targetHeight\)/);
  assert.doesNotMatch(source, /overflow-auto/);
});
