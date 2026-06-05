-- Schedule the daily briefing generation at 08:00 KST (= 23:00 UTC).
-- Requires pg_cron + pg_net. The anon key below is public/safe to expose;
-- the Edge Function is deployed with verify_jwt = false and self-limits work
-- via a freshness check, so this only triggers one Gemini call per day.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('stock-finder-daily-briefing')
where exists (
  select 1 from cron.job where jobname = 'stock-finder-daily-briefing'
);

select cron.schedule(
  'stock-finder-daily-briefing',
  '0 23 * * *',  -- 23:00 UTC == 08:00 KST, daily
  $$
  select net.http_post(
    url     := 'https://etasxbaorwgjoofdxean.supabase.co/functions/v1/generate-briefing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<SUPABASE_ANON_OR_PUBLISHABLE_KEY>',
      'Authorization', 'Bearer <SUPABASE_ANON_OR_PUBLISHABLE_KEY>'
    ),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 150000
  );
  $$
);
