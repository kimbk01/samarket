-- WP1 관리자 알림 CMS (ADM-03/04/05/08/09 + 보관 + 감사 로그)
-- Additive + idempotent. Application code tolerates this migration being absent
-- (archive tab disabled, audit writes logged as warnings).
--
-- 1) admin_notification_campaigns.archived_at / archived_by  (보관)
-- 2) admin_notification_campaign_audit_logs                   (감사 로그, service_role only)
-- 3) admin_notification_campaign_status_transition_allowed()  (ADM-09 SQL mirror of
--    lib/admin/notification-campaigns/campaign-status-machine.ts CAMPAIGN_STATUS_TRANSITIONS —
--    contract test campaign-status-machine.test.ts keeps both lists identical)
-- 4) list index for tab pagination (is_qa, archived_at, status, created_at desc, id desc)
-- Data backfill (13 legacy rows left `draft` after sending) is NOT part of this migration —
-- schema only. See docs/notifications/adm-cms-legacy-draft-status-backfill.sql (Owner-run).
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS public.admin_notification_campaigns_list_tab_idx;
--   DROP FUNCTION IF EXISTS public.admin_notification_campaign_status_transition_allowed(text, text);
--   DROP TABLE IF EXISTS public.admin_notification_campaign_audit_logs;
--   ALTER TABLE public.admin_notification_campaigns DROP COLUMN IF EXISTS archived_by;
--   ALTER TABLE public.admin_notification_campaigns DROP COLUMN IF EXISTS archived_at;

BEGIN;

-- 1) Archive
ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.admin_notification_campaigns.archived_at IS
  '보관 시각 — set: hidden from 작성 중/진행 중/완료/QA tabs; only for campaigns with nothing in flight';

-- 2) Audit log
CREATE TABLE IF NOT EXISTS public.admin_notification_campaign_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns (id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  before jsonb,
  after jsonb,
  target_count int,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notification_campaign_audit_logs_campaign_idx
  ON public.admin_notification_campaign_audit_logs (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notification_campaign_audit_logs_actor_idx
  ON public.admin_notification_campaign_audit_logs (actor_id, created_at DESC);

ALTER TABLE public.admin_notification_campaign_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_notification_campaign_audit_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_notification_campaign_audit_logs TO service_role;

COMMENT ON TABLE public.admin_notification_campaign_audit_logs IS
  'Admin notification campaign mutations (create/edit/send/resend/schedule/cancel/stop/pause/resume/archive/duplicate/source_skip). actor_id NULL = system (cron).';

-- 3) ADM-09 status transition table (mirror of CAMPAIGN_STATUS_TRANSITIONS)
CREATE OR REPLACE FUNCTION public.admin_notification_campaign_status_transition_allowed(
  p_from text,
  p_to text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('draft', 'scheduled'),
        ('draft', 'active'),
        ('draft', 'sending'),
        ('draft', 'cancelled'),
        ('scheduled', 'sending'),
        ('scheduled', 'cancelled'),
        ('scheduled', 'failed'),
        ('active', 'paused'),
        ('active', 'ended'),
        ('paused', 'active'),
        ('paused', 'ended'),
        ('sending', 'sent'),
        ('sending', 'partially_failed'),
        ('sending', 'failed'),
        ('sending', 'cancelled'),
        ('failed', 'sending')
    ) AS t (from_status, to_status)
    WHERE t.from_status = p_from
      AND t.to_status = p_to
  );
$$;

REVOKE ALL ON FUNCTION public.admin_notification_campaign_status_transition_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notification_campaign_status_transition_allowed(text, text) TO service_role;

COMMENT ON FUNCTION public.admin_notification_campaign_status_transition_allowed(text, text) IS
  'ADM-09 SSOT mirror of lib/admin/notification-campaigns/campaign-status-machine.ts CAMPAIGN_STATUS_TRANSITIONS';

-- 4) Tab pagination index
CREATE INDEX IF NOT EXISTS admin_notification_campaigns_list_tab_idx
  ON public.admin_notification_campaigns (is_qa, status, created_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_notification_campaigns_archived_idx
  ON public.admin_notification_campaigns (archived_at DESC, created_at DESC, id DESC)
  WHERE archived_at IS NOT NULL;

COMMIT;
