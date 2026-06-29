# Cleanup Metrics

This document describes how to monitor screenshot cleanup effectiveness.

## Key Metrics

### Cleanup Rate

**Definition:** Number of screenshots cleaned per execution

Query to check (via Supabase dashboard):
```sql
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as cleaned_count
FROM screenshots
WHERE deleted_at IS NOT NULL
  AND updated_at > NOW() - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;
```

**Expected:** Decreasing count after each cron run (2 AM UTC)

### Soft-Deleted vs. Expired

Query to see breakdown:
```sql
SELECT 
  'soft_deleted' as type,
  COUNT(*) as count
FROM screenshots
WHERE deleted_at IS NOT NULL

UNION ALL

SELECT 
  'expired' as type,
  COUNT(*) as count
FROM screenshots s
WHERE s.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM capture_sessions cs
    WHERE cs.id = s.session_id
      AND cs.stopped_at IS NOT NULL
      AND NOW() > (cs.stopped_at + (
        SELECT retention_days FROM organizations o 
        WHERE o.id = cs.organization_id
      ) * INTERVAL '1 day')
  );
```

### Cleanup Cost Estimate

Each cleanup run costs approximately:
- **Storage API calls:** ~2 calls per 500 screenshots
- **Database operations:** 1 query + 1 batch delete
- **Execution time:** <30 seconds typical

Monthly estimate (if cleaning ~5K screenshots/month):
- Cost: Negligible (included in Supabase free tier)

## Dashboard Queries

Add these to a monitoring dashboard if available:

```sql
-- Last cleanup execution (status & time)
SELECT 
  created_at,
  status,
  duration_ms
FROM function_executions
WHERE function_name = 'cleanup-screenshots'
ORDER BY created_at DESC
LIMIT 1;
```

```sql
-- Cleanup frequency check
SELECT 
  DATE(created_at) as date,
  COUNT(*) as execution_count,
  AVG(duration_ms) as avg_duration_ms
FROM function_executions
WHERE function_name = 'cleanup-screenshots'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;
```

## Alerts (Optional)

If setting up monitoring, alert on:
- **Cron fails:** Function status = "failed"
- **Slow execution:** Duration > 120 seconds
- **Missing execution:** No execution in 25 hours (should run daily at 2 AM)

Alert configuration: Check Supabase dashboard for alerts setup and contact configuration.
