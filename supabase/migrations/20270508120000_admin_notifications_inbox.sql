-- R13 — ADMIN NOTIFICATION store (separate from Member notification_events).
--
-- Contract:
--   * One row per recipient admin (fan-out at creation). Read state lives on the row.
--   * Reading a notification never changes business workload (Admin Action Queue).
--   * Writes are server-only (service role) via lib/admin/notifications/admin-notification-service.ts.
--   * Access = active admin membership (internal.is_platform_admin) AND recipient = caller.
--     Permission-scoped rows (required_permission) are additionally filtered by the server API
--     at read and push time (permission keys are resolved in the app layer).
--   * Revoked / suspended admins: rows are KEPT (audit) but no longer readable (RLS + API).
--   * Retention: rows older than 90 days are archived (archived_at), never deleted here.
--     Audit/legal retention records live in audit_logs / support_case_events, not in this table.
--   * dedupe: UNIQUE(recipient_admin_id, dedupe_key) — one event → at most one row per admin.

begin;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_admin_id uuid not null,
  required_permission text null,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text null,
  link_url text null,
  work_ref_table text null,
  work_ref_id text null,
  dedupe_key text not null,
  actor_user_id uuid null,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  archived_at timestamptz null,
  push_status text not null default 'none'
    check (push_status in ('none', 'sent', 'skipped_revoked', 'skipped_permission', 'skipped_disabled', 'failed')),
  push_attempted_at timestamptz null,
  constraint admin_notifications_recipient_dedupe_key unique (recipient_admin_id, dedupe_key)
);

comment on table public.admin_notifications is
  'R13 Admin-only notification inbox (per-recipient rows). NOT Member notification_events; NOT Admin Action Queue workload.';

create index if not exists admin_notifications_recipient_active_idx
  on public.admin_notifications (recipient_admin_id, created_at desc)
  where archived_at is null;

create index if not exists admin_notifications_recipient_unread_idx
  on public.admin_notifications (recipient_admin_id)
  where read_at is null and archived_at is null;

create index if not exists admin_notifications_work_ref_idx
  on public.admin_notifications (work_ref_table, work_ref_id)
  where work_ref_id is not null;

alter table public.admin_notifications enable row level security;

revoke all on public.admin_notifications from anon;
revoke all on public.admin_notifications from authenticated;
grant select on public.admin_notifications to authenticated;
grant all on public.admin_notifications to service_role;

drop policy if exists admin_notifications_select_own_active_admin on public.admin_notifications;
create policy admin_notifications_select_own_active_admin on public.admin_notifications
  for select to authenticated
  using (
    recipient_admin_id = auth.uid()
    and internal.is_platform_admin(auth.uid())
  );
-- No INSERT / UPDATE / DELETE policies: client writes are impossible; server uses service role.

-- 90-day archive (manual / scheduler-invoked; scheduling is a separate approval).
create or replace function public.admin_notifications_archive_expired(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'invalid_retention_days';
  end if;
  update public.admin_notifications
     set archived_at = now()
   where archived_at is null
     and created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_notifications_archive_expired(integer) from public;
revoke all on function public.admin_notifications_archive_expired(integer) from anon, authenticated;
grant execute on function public.admin_notifications_archive_expired(integer) to service_role;

commit;
