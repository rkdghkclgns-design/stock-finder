-- Stock Finder: daily briefing storage.
-- Namespaced with the `stock_finder_` prefix so it stays fully isolated from
-- the other tables in this shared Supabase project.

create table if not exists public.stock_finder_briefings (
  id            bigint generated always as identity primary key,
  briefing_date date        not null unique,
  generated_at  timestamptz not null default now(),
  model         text,
  source        text        not null default 'manual',  -- 'cron' | 'manual' | 'seed'
  data          jsonb       not null
);

comment on table public.stock_finder_briefings is
  'Daily stock market briefings for the stock-finder app. Namespaced/isolated from other tables.';

create index if not exists stock_finder_briefings_date_idx
  on public.stock_finder_briefings (briefing_date desc);

-- Row Level Security: anyone may read, only the service_role (which bypasses
-- RLS) may write. The Edge Function writes with the service role key.
alter table public.stock_finder_briefings enable row level security;

drop policy if exists "stock_finder_public_read" on public.stock_finder_briefings;
create policy "stock_finder_public_read"
  on public.stock_finder_briefings
  for select
  to anon, authenticated
  using (true);

grant select on public.stock_finder_briefings to anon, authenticated;
grant all    on public.stock_finder_briefings to service_role;
