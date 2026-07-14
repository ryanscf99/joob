create extension if not exists pgcrypto;

create type public.application_status as enum
  ('saved', 'preparing', 'applied', 'reviewing', 'interview', 'offered', 'rejected', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'en' check (locale in ('en', 'zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.youth_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  age smallint not null check (age between 14 and 100),
  is_student boolean not null default false,
  languages text[] not null default '{}',
  skills text[] not null default '{}',
  preferred_lanes text[] not null default '{}',
  preferred_sectors text[] not null default '{}',
  availability text not null default '',
  district text not null default '',
  bio text not null default '',
  parental_consent boolean not null default false,
  cv_features jsonb,
  cv_file_name text,
  cv_uploaded_at timestamptz,
  ai_consent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.saved_jobs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null,
  job_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null,
  source text not null,
  source_url text,
  title_snapshot text not null,
  company_snapshot text not null,
  status public.application_status not null default 'applied',
  note text,
  applied_at timestamptz not null default now(),
  follow_up_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  enabled boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  algorithm_version text not null,
  input_provenance jsonb not null default '{}',
  preferences jsonb not null default '{}',
  result_summary jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index applications_user_status_idx on public.applications(user_id, status);
create index applications_follow_up_idx on public.applications(user_id, follow_up_at);
create index job_alerts_user_enabled_idx on public.job_alerts(user_id, enabled);
create index match_runs_user_created_idx on public.match_runs(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.youth_profiles enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.applications enable row level security;
alter table public.job_alerts enable row level security;
alter table public.match_runs enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own youth profile" on public.youth_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own saved jobs" on public.saved_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts" on public.job_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own match runs" on public.match_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
