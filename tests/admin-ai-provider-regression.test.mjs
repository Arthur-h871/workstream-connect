import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("organizations service exposes updateOrgAiProvider with the expected signature", () => {
  const source = readProjectFile("./backend/api/services/organizations.service.ts");

  assert.match(
    source,
    /export async function updateOrgAiProvider\(\s*orgId: string,\s*provider: "anthropic" \| "gemini",?\s*\): Promise<void>/,
  );
});

test("admin membros page renders both AI provider options and wires the update call", () => {
  const source = readProjectFile("./src/routes/_authenticated.admin.membros.tsx");

  assert.match(source, /<option value="anthropic">Claude<\/option>/);
  assert.match(source, /<option value="gemini">Gemini<\/option>/);
  assert.match(source, /updateOrgAiProvider\(orgId, next\)/);
});
