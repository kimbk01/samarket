-- PTR Reveal restricted audience — fail-closed allowlist for ptr_reveal only.
-- Default audience_mode='all' leaves interruptive (popup) campaigns unchanged.
-- Empty allowlist + audience_mode='allowlist' → serve nobody (application layer).

BEGIN;

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS audience_mode text NOT NULL DEFAULT 'all';

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS audience_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.platform_popup_campaigns
  DROP CONSTRAINT IF EXISTS platform_popup_campaigns_audience_mode_check;

ALTER TABLE public.platform_popup_campaigns
  ADD CONSTRAINT platform_popup_campaigns_audience_mode_check
  CHECK (audience_mode IN ('all', 'allowlist'));

COMMENT ON COLUMN public.platform_popup_campaigns.audience_mode IS
  'all = every eligible viewer (default; popups). allowlist = only audience_user_ids (ptr_reveal QA / restricted). Empty allowlist serves nobody.';

COMMENT ON COLUMN public.platform_popup_campaigns.audience_user_ids IS
  'Auth user UUIDs when audience_mode=allowlist. Ignored when audience_mode=all.';

COMMIT;
