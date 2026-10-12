-- Run once in Supabase → SQL Editor (or: supabase db push).
-- Server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

create table if not exists public.emails (
  id text primary key,
  sender text,
  subject text,
  body_text text,
  body_html text,
  summary text,
  tags text,
  received_at bigint,
  digested integer not null default 0,
  confirmed_at bigint,
  source_type text,
  source_url text
);

create index if not exists idx_emails_received_at on public.emails (received_at desc);
create index if not exists idx_emails_source_type on public.emails (source_type);

create table if not exists public.app_state (
  key text primary key,
  value text
);

create table if not exists public.feeds (
  id bigserial primary key,
  name text not null,
  category text,
  feed_url text not null unique,
  site_url text,
  active integer not null default 1,
  weight integer not null default 1,
  max_items integer not null default 10,
  etag text,
  last_modified text,
  last_fetched_at text,
  last_status text,
  last_error text,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_feeds_active on public.feeds (active);

create table if not exists public.bartma_opportunities (
  id text primary key,
  company text not null,
  role text not null,
  track text,
  url text,
  score integer,
  status text not null default 'Sent',
  rationale text,
  warm_path text,
  caveat text,
  issue_number integer,
  sent_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_bartma_status on public.bartma_opportunities (status);
create index if not exists idx_bartma_url on public.bartma_opportunities (url);

-- Personal app: service role only. Keep RLS off (or add policies if you expose anon).
alter table public.emails enable row level security;
alter table public.app_state enable row level security;
alter table public.feeds enable row level security;
alter table public.bartma_opportunities enable row level security;
-- No anon policies → PostgREST anon key cannot read/write; service role still can.
