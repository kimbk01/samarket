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
--     service role + staff permission `reports`). Client admin write policies are pinned
--     to FALSE (ALTER POLICY — non-destructive, re-run safe; nothing is dropped).
--   * Member policies (reporter insert / own select, sanctioned user own select) unchanged.

do $$
begin
  -- reports ---------------------------------------------------------------
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_update_admin') then
    alter policy reports_update_admin on public.reports using (false) with check (false);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_select_own') then
    alter policy reports_select_own on public.reports using (auth.uid() = reporter_id);
  else
    create policy reports_select_own on public.reports for select using (auth.uid() = reporter_id);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_admin_select') then
    alter policy reports_admin_select on public.reports to authenticated
      using (internal.is_platform_admin(auth.uid()));
  else
    create policy reports_admin_select on public.reports for select to authenticated
      using (internal.is_platform_admin(auth.uid()));
  end if;

  -- report_actions --------------------------------------------------------
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'report_actions' and policyname = 'report_actions_insert_admin') then
    alter policy report_actions_insert_admin on public.report_actions with check (false);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'report_actions' and policyname = 'report_actions_select_admin') then
    alter policy report_actions_select_admin on public.report_actions to authenticated
      using (internal.is_platform_admin(auth.uid()));
  else
    create policy report_actions_select_admin on public.report_actions for select to authenticated
      using (internal.is_platform_admin(auth.uid()));
  end if;

  -- sanctions -------------------------------------------------------------
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sanctions' and policyname = 'sanctions_insert_admin') then
    alter policy sanctions_insert_admin on public.sanctions with check (false);
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sanctions' and policyname = 'sanctions_select') then
    alter policy sanctions_select on public.sanctions
      using (auth.uid() = user_id or internal.is_platform_admin(auth.uid()));
  else
    create policy sanctions_select on public.sanctions for select
      using (auth.uid() = user_id or internal.is_platform_admin(auth.uid()));
  end if;
end;
$$;
