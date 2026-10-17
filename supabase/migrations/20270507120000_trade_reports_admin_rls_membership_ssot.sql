-- R6 — Trade report admin authority = admin_memberships (internal.is_platform_admin).
--
-- Before: reports / report_actions / sanctions admin policies checked legacy
-- profiles.role IN ('admin','master'). Server authority (requireAdminApiUser /
-- requireAdminPermission) uses admin_memberships only, and production admins have
-- profiles.role = 'user', so admin reads of report_actions/sanctions returned nothing
-- and the browser report writer was rejected by RLS (0 report_actions ever).
--
-- After:
--   * Admin READ policies use internal.is_platform_admin(auth.uid()).
--   * Admin WRITES are server-only (POST /api/admin/reports/[reportId]/action with
--     service role + staff permission `reports`). Client admin write policies are dropped.
--   * Member policies (reporter insert / own select, sanctioned user own select) unchanged.

begin;

-- reports ---------------------------------------------------------------
drop policy if exists reports_update_admin on public.reports;

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select
  using (auth.uid() = reporter_id);

-- reports_admin_select (internal.is_platform_admin) already exists; recreate idempotently.
drop policy if exists reports_admin_select on public.reports;
create policy reports_admin_select on public.reports
  for select to authenticated
  using (internal.is_platform_admin(auth.uid()));

-- report_actions --------------------------------------------------------
drop policy if exists report_actions_insert_admin on public.report_actions;

drop policy if exists report_actions_select_admin on public.report_actions;
create policy report_actions_select_admin on public.report_actions
  for select to authenticated
  using (internal.is_platform_admin(auth.uid()));

-- sanctions -------------------------------------------------------------
drop policy if exists sanctions_insert_admin on public.sanctions;

drop policy if exists sanctions_select on public.sanctions;
create policy sanctions_select on public.sanctions
  for select
  using (auth.uid() = user_id or internal.is_platform_admin(auth.uid()));

commit;
