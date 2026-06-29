-- Enable pg_cron and pg_net extensions for scheduled edge function calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily cleanup of screenshots at 2 AM UTC
SELECT cron.schedule(
  'cleanup-screenshots-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zuovkxvykjcozxlilmby.supabase.co/functions/v1/cleanup-screenshots',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
