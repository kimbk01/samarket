-- Phase C APPLY — chat_domain + domain_identity (nullable dual-write window)
-- SSOT: lib/chat-domain/four-domain-freeze.ts
-- Doc: docs/community-messenger/2026-07-23-four-domain-phase-c.md
-- Backfill UPDATEs remain commented until dry-run report approval.

-- ---------------------------------------------------------------------------
-- 1) Room: chat_domain + domain_identity
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_messenger_rooms
  ADD COLUMN IF NOT EXISTS chat_domain text NULL,
  ADD COLUMN IF NOT EXISTS domain_identity text NULL;

ALTER TABLE public.community_messenger_rooms
  DROP CONSTRAINT IF EXISTS community_messenger_rooms_chat_domain_check;

ALTER TABLE public.community_messenger_rooms
  ADD CONSTRAINT community_messenger_rooms_chat_domain_check
  CHECK (
    chat_domain IS NULL
    OR chat_domain IN ('general_direct', 'group', 'trade', 'store_order')
  );

COMMENT ON COLUMN public.community_messenger_rooms.chat_domain IS
  'Phase C+ SSOT ChatDomain. Set once at create; never re-infer at runtime.';
COMMENT ON COLUMN public.community_messenger_rooms.domain_identity IS
  'Phase C+ canonical identity (gd:… / group:… / trade:… / so:order:…). Immutable after create.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_rooms_domain_identity
  ON public.community_messenger_rooms (domain_identity)
  WHERE domain_identity IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Participant: store_order_role
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_messenger_participants
  ADD COLUMN IF NOT EXISTS store_order_role text NULL;

ALTER TABLE public.community_messenger_participants
  DROP CONSTRAINT IF EXISTS community_messenger_participants_store_order_role_check;

ALTER TABLE public.community_messenger_participants
  ADD CONSTRAINT community_messenger_participants_store_order_role_check
  CHECK (
    store_order_role IS NULL
    OR store_order_role IN ('customer', 'owner')
  );

COMMENT ON COLUMN public.community_messenger_participants.store_order_role IS
  'store_order domain only. Maps to so:customer|owner projection keys; not room domain_identity.';

-- ---------------------------------------------------------------------------
-- 3) Backfill — DO NOT uncomment without dry-run misclassify report
-- ---------------------------------------------------------------------------
-- UPDATE … general_direct / group / store_order (see migrations-draft copy)
-- trade: separate script after ledger policy
;