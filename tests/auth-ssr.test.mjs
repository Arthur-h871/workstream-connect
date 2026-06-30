import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = new URL("../", import.meta.url);

function readRoute(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("authenticated route disables SSR because auth guard depends on browser session storage", () => {
  const source = readRoute("./src/routes/_authenticated.tsx");

  assert.match(source, /createFileRoute\("\/_authenticated"\)\(\{[\s\S]*ssr:\s*false,/);
});

test("public auth entry routes also disable SSR before checking session state", () => {
  for (const routePath of ["./src/routes/login.tsx", "./src/routes/cadastro.tsx"]) {
    const source = readRoute(routePath);

    assert.match(source, /createFileRoute\([^)]*\)\(\{[\s\S]*ssr:\s*false,/);
  }
});
