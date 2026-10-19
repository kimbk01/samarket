-- PUSH-02 — APNs environment per device token (sandbox = Xcode Run / development profile,
-- production = TestFlight · App Store). Distinct from user_devices.environment (deploy stage).
-- Additive and nullable: existing rows stay NULL → server default host (APNS_PRODUCTION), the same
-- behaviour as before. The sender fills it once a token is proven on a host; iOS builds that report
-- it at register time set it directly.
-- Rollback: alter table public.user_devices drop column if exists apns_environment;

alter table public.user_devices
  add column if not exists apns_environment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_devices_apns_environment_check'
      and conrelid = 'public.user_devices'::regclass
  ) then
    alter table public.user_devices
      add constraint user_devices_apns_environment_check
      check (apns_environment is null or apns_environment in ('sandbox', 'production'));
  end if;
end $$;

comment on column public.user_devices.apns_environment is
  'PUSH-02: APNs host environment of this token (sandbox|production). NULL = unknown → APNS_PRODUCTION default.';
