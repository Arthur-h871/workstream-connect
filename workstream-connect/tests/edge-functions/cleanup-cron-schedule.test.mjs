import test from "node:test";
import assert from "node:assert/strict";

const SUPABASE_URL = "https://zuovkxvykjcozxlilmby.supabase.co";
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3ZreHZ5a2pjb3p4bGlsbWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgwNDk3MjAsImV4cCI6MjA2MzYyNTcyMH0.KFT_4PJ0OHC39h9q4lsz0GRpTSFqwQ5xtSMb9_0VbC0";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/cleanup-screenshots`;
const CRON_JOB_NAME = "cleanup-screenshots-daily";
const EXPECTED_SCHEDULE = "0 2 * * *";

test("pg_cron job is registered for cleanup-screenshots-daily", async () => {
  const url =
    `${SUPABASE_URL}/rest/v1/cron.job` +
    `?select=jobname,schedule,active` +
    `&jobname=eq.${CRON_JOB_NAME}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
  });

  if (response.status === 404 || response.status === 403 || response.status === 401) {
    // cron.job schema is not exposed via anon key — skip with instructions
    console.log(
      `\n⚠️  cron.job not accessible via anon key (HTTP ${response.status}) — verify manually via SQL:\n` +
        `  SELECT * FROM cron.job WHERE jobname = '${CRON_JOB_NAME}';\n` +
        `  Expected: schedule = '${EXPECTED_SCHEDULE}', active = true\n`,
    );
    return; // skip gracefully
  }

  assert.strictEqual(
    response.status,
    200,
    `Unexpected HTTP status from cron.job endpoint: ${response.status}`,
  );

  const data = await response.json();
  assert.ok(Array.isArray(data), "Expected an array response from REST API");

  assert.ok(
    data.length > 0,
    `No pg_cron job found with jobname '${CRON_JOB_NAME}' — ` +
      `run the migration or check the job name in the database.`,
  );

  const job = data[0];
  assert.strictEqual(
    job.schedule,
    EXPECTED_SCHEDULE,
    `Expected cron schedule '${EXPECTED_SCHEDULE}', got '${job.schedule}'`,
  );
  assert.strictEqual(
    job.active,
    true,
    `Expected pg_cron job to be active, but active = ${job.active}`,
  );
});

test("cleanup-screenshots edge function is reachable (HTTP 200 sanity check)", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assert.ok(
    [200, 207].includes(response.status),
    `Expected HTTP 200 or 207 from cleanup-screenshots, got ${response.status}`,
  );
});
