-- Cache of AI company analyses (favorites feature). Shared across users.
-- Namespaced with `stock_finder_` so it stays isolated from other tables.

create table if not exists public.stock_finder_company_analysis (
  id            bigint generated always as identity primary key,
  company_key   text        not null,   -- normalized: lower(ticker || '|' || name)
  company       text        not null,
  ticker        text,
  market        text,                    -- 'KR' | 'US' | null
  analysis_date date        not null,
  generated_at  timestamptz not null default now(),
  model         text,
  data          jsonb       not null,
  unique (company_key, analysis_date)
);

comment on table public.stock_finder_company_analysis is
  'Cached per-company AI analyses for the stock-finder app. Namespaced/isolated.';

create index if not exists stock_finder_company_analysis_key_idx
  on public.stock_finder_company_analysis (company_key, analysis_date desc);

alter table public.stock_finder_company_analysis enable row level security;

drop policy if exists "stock_finder_analysis_public_read" on public.stock_finder_company_analysis;
create policy "stock_finder_analysis_public_read"
  on public.stock_finder_company_analysis
  for select
  to anon, authenticated
  using (true);

grant select on public.stock_finder_company_analysis to anon, authenticated;
grant all    on public.stock_finder_company_analysis to service_role;
