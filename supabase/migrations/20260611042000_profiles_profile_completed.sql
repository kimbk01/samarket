alter table if exists public.profiles
  add column if not exists profile_completed boolean not null default false;

comment on column public.profiles.profile_completed is
  'Whether the member completed the DIBAY profile setup flow.';
