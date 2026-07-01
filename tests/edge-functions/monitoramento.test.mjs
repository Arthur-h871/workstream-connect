import test from "node:test";
import assert from "node:assert/strict";

const FUNCTION_URL = "https://zuovkxvykjcozxlilmby.supabase.co/functions/v1/monitoramento";

test("monitoramento handles CORS preflight (OPTIONS)", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    },
  });
  assert.strictEqual(response.status, 200);
});

test("monitoramento rejects requests without Authorization header", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start" }),
  });
  // verify_jwt at the platform level intercepts before the function body runs.
  assert.strictEqual(response.status, 401);
  const data = await response.json();
  assert.ok("message" in data);
});

test("monitoramento rejects invalid action even with a malformed token", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-a-real-token",
    },
    body: JSON.stringify({ action: "not-a-real-action" }),
  });
  // Token is invalid, so the platform rejects it before the action switch is reached.
  assert.strictEqual(response.status, 401);
});
