-- Notification Target Domain Snapshot (Badge Authority continuation)
-- Baseline: cec75d0b2
-- CONTRACT:
--   rooms.chat_domain + rooms.domain_identity_key → notification_targets snapshot
--   Pair-only fill; never invent from peer/direct_key/target_type; never default general_direct
--   Existing non-NULL pair never overwritten; partial pair never COALESCE-repaired
-- Operational backfill UPDATEs are NOT in this file — dry-run + separate approval required.

-- ---------------------------------------------------------------------------
-- 1) Columns (prod may already have them; IF NOT EXISTS for repo/prod parity)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_targets
  ADD COLUMN IF NOT EXISTS chat_domain text NULL,
  ADD COLUMN IF NOT EXISTS domain_identity_key text NULL;

ALTER TABLE public.notification_targets
  DROP CONSTRAINT IF EXISTS notification_targets_chat_domain_check;

ALTER TABLE public.notification_targets
  ADD CONSTRAINT notification_targets_chat_domain_check
  CHECK (
    chat_domain IS NULL
    OR chat_domain IN ('general_direct', 'group', 'trade', 'store_order')
  );

COMMENT ON COLUMN public.notification_targets.chat_domain IS
  'Immutable Domain snapshot from community_messenger_rooms at unread bump; NULL = not Domain-aggregable.';
COMMENT ON COLUMN public.notification_targets.domain_identity_key IS
  'Paired with chat_domain; both NULL or both set. Filled only from room authority.';

CREATE INDEX IF NOT EXISTS idx_notification_targets_user_domain_unread
  ON public.notification_targets (user_id, chat_domain)
  WHERE is_unread = true AND chat_domain IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) upsert — atomic unread + Domain pair from room authority
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_notification_target_unread(
  p_user_id uuid,
  p_target_type text,
  p_target_id text,
  p_scope text DEFAULT 'consumer',
  p_store_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT NULL,
  p_room_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := btrim(coalesce(p_target_type, ''));
  v_tid text := btrim(coalesce(p_target_id, ''));
  v_scope text;
  v_room_id uuid := p_room_id;
  v_room_domain text;
  v_room_identity text;
  v_existing_domain text;
  v_existing_identity text;
  v_write_domain text := NULL;
  v_write_identity text := NULL;
  v_room_based boolean;
BEGIN
  IF p_user_id IS NULL OR v_type = '' OR v_tid = '' THEN
    RETURN;
  END IF;

  v_scope := CASE
    WHEN btrim(coalesce(p_scope, '')) IN ('consumer', 'owner_store', 'rider') THEN btrim(p_scope)
    ELSE 'consumer'
  END;

  v_room_based := v_type IN ('chat_room', 'owner_order_chat', 'trade', 'buyer_order');

  -- Resolve canonical room id: explicit p_room_id, else chat_room/owner_order_chat target_id
  IF v_room_id IS NULL AND v_type IN ('chat_room', 'owner_order_chat') THEN
    BEGIN
      v_room_id := v_tid::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_room_id := NULL;
    END;
  END IF;

  IF v_room_based AND v_room_id IS NOT NULL THEN
    SELECT
      nullif(btrim(r.chat_domain), ''),
      nullif(btrim(coalesce(r.domain_identity_key, r.domain_identity)), '')
    INTO v_room_domain, v_room_identity
    FROM public.community_messenger_rooms AS r
    WHERE r.id = v_room_id;

    -- Proven pair only: both present, domain enum, identity prefixed by domain:
    IF v_room_domain IS NOT NULL
       AND v_room_identity IS NOT NULL
       AND v_room_domain IN ('general_direct', 'group', 'trade', 'store_order')
       AND v_room_identity LIKE (v_room_domain || ':%')
       AND length(v_room_identity) > length(v_room_domain) + 1
    THEN
      -- Reject known non-canonical trade legacy forms without inventing a replacement
      IF v_room_domain = 'trade'
         AND (
           v_room_identity = 'trade:legacy'
           OR v_room_identity LIKE 'trade:legacy:%'
         )
      THEN
        v_room_domain := NULL;
        v_room_identity := NULL;
      END IF;
    ELSE
      v_room_domain := NULL;
      v_room_identity := NULL;
    END IF;
  END IF;

  SELECT nt.chat_domain, nt.domain_identity_key
  INTO v_existing_domain, v_existing_identity
  FROM public.notification_targets AS nt
  WHERE nt.user_id = p_user_id
    AND nt.target_type = v_type
    AND nt.target_id = v_tid;

  IF NOT FOUND THEN
    -- INSERT: snapshot only when room pair proven
    IF v_room_based AND v_room_domain IS NOT NULL AND v_room_identity IS NOT NULL THEN
      v_write_domain := v_room_domain;
      v_write_identity := v_room_identity;
    END IF;

    INSERT INTO public.notification_targets AS nt (
      user_id,
      target_type,
      target_id,
      scope,
      store_id,
      is_unread,
      last_event_at,
      meta,
      chat_domain,
      domain_identity_key,
      updated_at
    )
    VALUES (
      p_user_id,
      v_type,
      v_tid,
      v_scope,
      p_store_id,
      true,
      now(),
      p_meta,
      v_write_domain,
      v_write_identity,
      now()
    );
    RETURN;
  END IF;

  -- UPDATE unread always; Domain pair rules:
  -- both NULL + room proven → fill once
  -- both non-NULL match → keep
  -- both non-NULL mismatch → keep + log (no overwrite)
  -- partial → keep (no COALESCE repair)
  -- never write NULL over non-NULL
  v_existing_domain := nullif(btrim(v_existing_domain), '');
  v_existing_identity := nullif(btrim(v_existing_identity), '');

  IF v_existing_domain IS NULL AND v_existing_identity IS NULL THEN
    IF v_room_based AND v_room_domain IS NOT NULL AND v_room_identity IS NOT NULL THEN
      v_write_domain := v_room_domain;
      v_write_identity := v_room_identity;
    END IF;
  ELSIF v_existing_domain IS NOT NULL AND v_existing_identity IS NOT NULL THEN
    IF v_room_domain IS NOT NULL
       AND v_room_identity IS NOT NULL
       AND (
         v_existing_domain IS DISTINCT FROM v_room_domain
         OR v_existing_identity IS DISTINCT FROM v_room_identity
       )
    THEN
      RAISE LOG 'notification_target_domain_mismatch user=% type=% id=% existing_domain=% existing_key=% room_domain=% room_key=%',
        p_user_id, v_type, v_tid, v_existing_domain, v_existing_identity, v_room_domain, v_room_identity;
    END IF;
    -- keep existing (matched or mismatch) — leave v_write_* NULL
  ELSE
    -- partial: do not touch domain columns
    NULL;
  END IF;

  -- Always bump unread; Domain fill only when both columns still NULL (pair write).
  UPDATE public.notification_targets
  SET
    is_unread = true,
    last_event_at = now(),
    scope = v_scope,
    store_id = COALESCE(p_store_id, store_id),
    meta = COALESCE(p_meta, meta),
    chat_domain = CASE
      WHEN chat_domain IS NULL
        AND domain_identity_key IS NULL
        AND v_write_domain IS NOT NULL
        AND v_write_identity IS NOT NULL
      THEN v_write_domain
      ELSE chat_domain
    END,
    domain_identity_key = CASE
      WHEN chat_domain IS NULL
        AND domain_identity_key IS NULL
        AND v_write_domain IS NOT NULL
        AND v_write_identity IS NOT NULL
      THEN v_write_identity
      ELSE domain_identity_key
    END,
    updated_at = now()
  WHERE user_id = p_user_id
    AND target_type = v_type
    AND target_id = v_tid;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) IS
  'Badge target unread bump + optional Domain pair snapshot from community_messenger_rooms (NULL-pair fill only).';
