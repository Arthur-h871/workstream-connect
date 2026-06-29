# Screenshots Cleanup Cron Schedule

## Overview

The `cleanup-screenshots` Edge Function runs daily at **3:00 AM UTC** to remove:
1. Screenshots marked as soft-deleted (`deleted_at IS NOT NULL`)
2. Screenshots expired per organization retention policy

## Schedule

- **Frequency:** Every 24 hours
- **Time:** 3:00 AM UTC (to avoid peak hours)
- **Cron:** `0 3 * * *` (POSIX format)
- **Timeout:** 120 seconds max

## What It Cleans

### Soft-Deleted Screenshots
- Criterion: `deleted_at IS NOT NULL`
- Action: Removes from Supabase Storage, then deletes from `screenshots` table
- Batch size: 500 at a time

### Expired Screenshots
- Criterion: Current time > (session stopped_at + organization.retention_days)
- Default retention: 30 days if not set
- Action: Same as soft-deleted (storage + DB)

## Monitoring

### View Recent Executions

1. Open Supabase dashboard: https://app.supabase.com
2. Navigate to: Functions → cleanup-screenshots
3. Look at **Executions** tab
4. Check:
   - Execution timestamp (should be ~3:00 AM UTC daily)
   - Duration (should be <30s normally)
   - Status (green ✅ = success, red ❌ = error)

### Check Logs

Click on any execution to view full logs:
```
[cleanup-screenshots] Iniciando limpeza...
[cleanup-screenshots] Concluído — soft-deleted: 42, expired: 5, errors: []
```

### Expected Success Response

```json
{
  "softDeleted": 0,
  "expired": 0,
  "errors": []
}
```

(0 values are normal if nothing to clean.)

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Query error: permission denied` | RLS policy blocks cleanup | Check `screenshots` table RLS policies |
| `Storage batch error: ...` | Supabase storage issue | Check storage bucket `screenshots` exists |
| `DB delete error: ...` | Foreign key or constraint violation | Check for orphaned records |

## Manual Trigger (for testing)

```bash
curl -X POST https://zuovkxvykjcozxlilmby.supabase.co/functions/v1/cleanup-screenshots \
  -H "Content-Type: application/json"
```

## Adjusting Schedule

To change the cron schedule, run the following SQL in the Supabase SQL editor:

```sql
-- To change schedule, run in Supabase SQL editor:
SELECT cron.unschedule('cleanup-screenshots-daily');
SELECT cron.schedule('cleanup-screenshots-daily', '0 3 * * *', $$
  SELECT net.http_post(
    url := 'https://zuovkxvykjcozxlilmby.supabase.co/functions/v1/cleanup-screenshots',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

For example, to change to 4:00 AM UTC, replace `'0 3 * * *'` with `'0 4 * * *'`.

Then verify in the Supabase dashboard.

## Expected Behavior

- **First run:** ~3:00-3:05 AM UTC (day after deployment)
- **Every 24h after:** Same time the next day
- **No manual intervention needed:** Cron runs automatically

## Related Resources

- [Supabase Functions Scheduling](https://supabase.com/docs/guides/functions/scheduling)
- [POSIX Cron Format](https://en.wikipedia.org/wiki/Cron#CRON_expression)
- [PostgreSQL pg_cron Extension](https://github.com/citusdata/pg_cron)

## Monitoring Checklist (Weekly)

Every Monday morning, verify:

- [ ] Last 7 daily executions all have status ✅ (success)
- [ ] No execution has duration > 60 seconds (indicate slowness)
- [ ] Execution times cluster around 3:00-3:05 AM UTC
- [ ] Error logs are empty or only contain expected non-fatal messages

If any item fails:
1. Check logs for root cause
2. Verify `screenshots` table RLS policies allow cleanup
3. If critical, manually invoke and check response
4. Open issue if recurring problem
