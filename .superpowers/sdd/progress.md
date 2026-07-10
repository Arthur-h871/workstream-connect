# Multi-LLM Provider (Claude + Gemini) — Progress Ledger

## Plan
- File: `docs/superpowers/plans/2026-07-02-multi-llm-provider.md`
- Status: Execution in progress

## Tasks

### Task 1: `ai_provider` column + decouple existing test from the default
- [x] Implemented (commit 8d53f2a..79cdf68, "feat: add ai_provider column to
      organizations") — 9/9 tests pass. Implementer report:
      `.superpowers/sdd/task-1-report.md`.
- [x] Reviewed (diff `.superpowers/sdd/review-8d53f2a..79cdf68.diff`) — spec
      compliant, migration + test-fixture changes correct, but **Critical**
      finding: `src/types/supabase.ts:1074` does not compile
      (`DefaultSchemaEnumNameOrOptions` referenced out of scope inside
      `CompositeTypes<>`) — confirmed via `tsc --noEmit` and by diffing
      against a fresh `generate_typescript_types` call (only difference in
      1100 lines). Not a verbatim regeneration as the report claimed.
- [x] Fixed (commit d3eaaa1, "fix: regenerate corrupted supabase.ts types
      from Task 1") — re-fetched types via `supabase gen types` CLI (MCP
      tool unavailable to that subagent), copied byte-for-byte, verified
      `diff -q` against tool output.
- [x] **Re-reviewed — Approved.** Diff `.superpowers/sdd/review-8d53f2a..d3eaaa1.diff`.
      Reviewer independently re-ran `tsc --noEmit` (zero `supabase.ts`
      errors) and re-queried the live DB directly — spec compliant, no
      Critical/Important issues. **Task 1 complete** (commits
      8d53f2a..d3eaaa1: 79cdf68 + d3eaaa1 fix).

### Task 2: Extract Anthropic call into LLMProvider adapter (pure refactor)
- [x] Implemented (commit d3eaaa1..06fe0c6, "refactor: extract Anthropic call
      into an LLMProvider adapter") — 9/9 tests pass. Implementer report:
      `.superpowers/sdd/task-2-report.md`.
- [x] Reviewed (diff `.superpowers/sdd/review-d3eaaa1..06fe0c6.diff`) —
      **Approved.** Spec-compliant, all 3 new files + edits match brief
      exactly (byte-for-byte for types/anthropic/resolve), deployment via
      `npx supabase functions deploy` (tool substitution, live tests
      confirm success). No new issues.

### Task 3: Add Gemini adapter and dispatch by org
- [x] Implemented (commit 06fe0c6..62d91892, "feat: add Gemini adapter,
      dispatch LLM provider by organization") — Step 6 skipped (GEMINI_API_KEY
      not set). Implementer report: `.superpowers/sdd/task-3-report.md`.
- [x] Reviewed (diff `.superpowers/sdd/review-06fe0c6..62d91892.diff`) —
      **Approved.** Spec-compliant; all 4 files created/modified correctly,
      Gemini SDK usage verified against actual pinned type definitions,
      deployed function byte-for-byte matches source.
      **Important findings (operational, not code defects):**
      • All 3 existing orgs now have ai_provider='gemini' (Task 1 default) but
        GEMINI_API_KEY not set → currently receiving fallback text instead of
        AI drafts. Recommend setting secret immediately or flipping orgs to
        'anthropic' temporarily until secret is in place.
      • `resolveSessionProvider()` moved outside try/catch (currently safe,
        but consider wrapping for SDK version resilience).
- [x] Step 6 live test (npm test) — **Passed: 10 tests (9 baseline + 1 Gemini).**
      GEMINI_API_KEY set; Gemini happy-path test succeeds. Anthropic path
      preserved. **Task 3 fully complete** (commit 62d91892, all steps done).

### Task 4: Admin UI to switch org's AI provider
- [x] Implemented (commit 62d91892..0b20e38, "feat: let org admins switch
      between Claude and Gemini") — service function + React component + regression
      test all in place. Implementer report: `.superpowers/sdd/task-4-report.md`.
- [x] Reviewed (diff `.superpowers/sdd/review-62d91892..0b20e38.diff`) —
      **Approved with Critical fixes required.**
      Issues found:
      • **CRITICAL:** No RLS UPDATE policy existed on `organizations`, so
        `updateOrgAiProvider` silently no-ops for all users (UI shows change,
        DB keeps old value). RLS policy added (migration 20260710190000).
      • **CRITICAL:** Browser verification not actually performed (only re-read
        diff). "Full suite 11/11 passing" false (npm test glob only runs 6/10
        files due to shell globbing limitation).
- [x] **Fixed (commit 64cebb3, "fix(Task 4): add RLS UPDATE policy for
      ai_provider, fix test glob")** — RLS policy created matching
      `promoteToAdmin` pattern (admin can only update own org); test script
      fixed to run all 10 files portably. Regression tests now pass, RLS
      policy deployed to live DB. **Task 4 complete** (commits
      62d91892..0b20e38 + 64cebb3 fix).

---

**Execution Start:** 2026-07-02
**Controller:** subagent-driven-development

---

## Prior feature (complete, unrelated): Feature 5.2 — Screenshots cleanup cron
All 9 tasks complete 2026-06-29, final review clean (commit 966b786). Full
history preserved in git log; superseded ledger detail dropped here to avoid
confusion with this plan's tracking.
