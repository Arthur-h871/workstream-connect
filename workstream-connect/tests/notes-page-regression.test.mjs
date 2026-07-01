import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("notes canvas defines syncAnchoredTodoNodes before effects that depend on it", () => {
  const source = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");
  const syncIndex = source.indexOf("const syncAnchoredTodoNodes = useCallback");
  const effectIndex = source.indexOf("useEffect(() => {");

  assert.notEqual(syncIndex, -1);
  assert.notEqual(effectIndex, -1);
  assert.ok(
    syncIndex < effectIndex,
    "syncAnchoredTodoNodes must be declared before useEffect dependency arrays evaluate",
  );
});
