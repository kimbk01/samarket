-- Notification Target unread bump — idempotency (Boot/IO Authority, IO-only)
-- Baseline: 3cc78c14f (append-only; does NOT edit 20261008120000_notification_targets_domain_snapshot.sql)
--
-- WHY: upsert_notification_target_unread previously issued an UNCONDITIONAL UPDATE
--   (last_event_at = now(), updated_at = now()) even when the row was already unread
--   with the identical Domain snapshot/scope/store — a no-op physical UPDATE + WAL per
--   message, plus 4 downstream cache invalidations. This removes the write when nothing
--   would actually change.
--
-- CONTRACT (unchanged — LOCK: badge/notification domain authority, IO-only unlock):
--   * Bell / App Icon / Bottom / Hub aggregate MEANING unchanged (count is COUNT(is_unread=true)).
--   * Domain NULL-pair fill rule unchanged (fill once from room authority; never overwrite;
--     never COALESCE-repair partial; never invent domain).
--   * missedCallByRoom / Domain Facts semantics untouched.
--   * 4-domain identity untouched.
--
-- CHANGE (IO-only):
--   * RETURNS boolean — true = INSERT or real UPDATE performed; false = skipped no-op.
--   * Skip the UPDATE entirely when the existing row is ALREADY unread AND no column would
--     change: no Domain pair to fill, same scope, store_id unchanged (p_store_id NULL or equal),
--     meta unchanged (p_meta NULL). last_event_at/updated_at are write-only (not read by app),
--     so skipping their refresh is safe and is the whole point (no WAL for already-unread bump).

DROP FUNCTION IF EXISTS public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.upsert_notification_target_unread(
  p_user_id uuid,
  p_target_type text,
  p_target_id text,
  p_scope text DEFAULT 'consumer',
  p_store_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT NULL,
  p_room_id uuid DEFAULT NULL
)
RETURNS boolean
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
  v_existing_unread boolean;
  v_existing_scope text;
  v_existing_store_id uuid;
  v_write_domain text := NULL;
  v_write_identity text := NULL;
  v_room_based boolean;
BEGIN
  IF p_user_id IS NULL OR v_type = '' OR v_tid = '' THEN
    RETURN false;
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

  SELECT nt.chat_domain, nt.domain_identity_key, nt.is_unread, nt.scope, nt.store_id
  INTO v_existing_domain, v_existing_identity, v_existing_unread, v_existing_scope, v_existing_store_id
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
    RETURN true;
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

  -- IDEMPOTENCY GUARD (IO-only): skip the physical UPDATE when nothing would change.
  --   already unread + no Domain pair to fill + same scope + store_id/meta unchanged.
  --   (p_meta NULL means COALESCE keeps existing meta; p_store_id NULL means keep store.)
  IF v_existing_unread IS TRUE
     AND v_write_domain IS NULL
     AND v_write_identity IS NULL
     AND v_existing_scope IS NOT DISTINCT FROM v_scope
     AND (p_store_id IS NULL OR p_store_id IS NOT DISTINCT FROM v_existing_store_id)
     AND p_meta IS NULL
  THEN
    RETURN false;
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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb, uuid) IS
  'Badge target unread bump + optional Domain pair snapshot (NULL-pair fill only). Idempotent: RETURNS false and performs no physical UPDATE when the row is already unread and nothing would change.';
