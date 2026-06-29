import test from "node:test";
import assert from "node:assert/strict";

const FUNCTION_URL = "https://zuovkxvykjcozxlilmby.supabase.co/functions/v1/cleanup-screenshots";

test("cleanup-screenshots responds to POST with correct structure", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert.ok([200, 207].includes(response.status), `Expected 200 or 207, got ${response.status}`);

  const data = await response.json();
  assert.ok("softDeleted" in data, "missing softDeleted");
  assert.ok("expired" in data, "missing expired");
  assert.ok(Array.isArray(data.errors), "errors must be array");
  assert.strictEqual(typeof data.softDeleted, "number");
  assert.strictEqual(typeof data.expired, "number");
});

test("cleanup-screenshots handles CORS preflight (OPTIONS)", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    },
  });
  assert.strictEqual(response.status, 204);
});

test("cleanup-screenshots is idempotent (two consecutive calls return same structure)", async () => {
  const call = async () => {
    const r = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return r.json();
  };
  const [r1, r2] = await Promise.all([call(), call()]);
  assert.ok("softDeleted" in r1 && "softDeleted" in r2, "both calls must have softDeleted");
  assert.ok("errors" in r1 && "errors" in r2, "both calls must have errors");
});
