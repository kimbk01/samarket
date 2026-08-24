-- Product recovery phase 2 — extended HOME shelf CMS (product_config JSONB).

BEGIN;

ALTER TABLE public.store_composition_policy_overrides
  ADD COLUMN IF NOT EXISTS product_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_composition_policy_overrides.product_config IS
  'Extended HOME shelf CMS: entityType, showAll, imageSource, badgeMode, benefitLineMode, reviewSnippetMode, showAllHref, etc.';

ALTER TABLE public.store_browse_scope_policy
  ADD COLUMN IF NOT EXISTS product_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_browse_scope_policy.product_config IS
  'Extended browse scope CMS: showAll, CTA href, inherited field markers.';

COMMIT;
