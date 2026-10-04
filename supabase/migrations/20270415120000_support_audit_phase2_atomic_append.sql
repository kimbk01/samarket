-- Support audit Phase 2 (Owner-approved 2026-10-05).
-- DEF-05: message insert + case state/counter update in ONE transaction (no lost/partial updates).
-- DEF-14: at most one active (OPEN | WAITING_ADMIN | WAITING_USER) case per dedupe key.
-- DEF-17: repo/DB drift — idempotent re-assertion only (no-op where already applied).
-- No new status, column or table. Writes stay service_role only.

BEGIN;

-- ---------------------------------------------------------------------------
-- DEF-05 — atomic append (same transition rules as appendSupportMessage)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_append_message(
  p_case_id uuid,
  p_sender_type text,
  p_sender_user_id uuid,
  p_sender_admin_id uuid,
  p_message_type text,
  p_body text,
  p_system_seed boolean DEFAULT false
)
RETURNS public.support_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.support_messages;
  v_now timestamptz := now();
BEGIN
  PERFORM 1 FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_case_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.support_messages (
    case_id, sender_type, sender_user_id, sender_admin_id, message_type, body
  ) VALUES (
    p_case_id, p_sender_type, p_sender_user_id, p_sender_admin_id, p_message_type, p_body
  )
  RETURNING * INTO v_msg;

  IF p_sender_type = 'ADMIN' AND p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET status = 'WAITING_USER',
           requester_unread_count = requester_unread_count + 1,
           first_admin_response_at = COALESCE(first_admin_response_at, v_now),
           last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_sender_type IN ('MEMBER', 'OWNER') AND NOT COALESCE(p_system_seed, false) THEN
    UPDATE public.support_cases
       SET status = 'WAITING_ADMIN',
           admin_unread_count = admin_unread_count + 1,
           last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  ELSE
    UPDATE public.support_cases
       SET last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  END IF;

  RETURN v_msg;
END;
$$;

REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) IS
  'Support audit DEF-05: atomic message insert + case status/unread/first-response update.';

-- ---------------------------------------------------------------------------
-- DEF-14 — one active case per dedupe key (matches openSupportCaseFromContext dedupe query)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_cases_one_active_per_key
  ON public.support_cases (
    requester_user_id,
    audience,
    category,
    (COALESCE(owner_store_id::text, '')),
    (COALESCE(reference_type, '')),
    (COALESCE(reference_id, ''))
  )
  WHERE status IN ('OPEN', 'WAITING_ADMIN', 'WAITING_USER');

-- ---------------------------------------------------------------------------
-- DEF-17 — repo/DB drift re-assertion (no-op on production where already applied)
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_admin_note_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_events'::regclass
       AND conname = 'notification_events_type_check'
       AND pg_get_constraintdef(oid) LIKE '%support_case_reopened%'
  ) THEN
    ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_type_check;
    ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_type_check CHECK (
      type IN (
        'chat_message','group_message','mention_message','pin_message','trade_message',
        'store_order_message','trade_status','order_status','delivery_status','community_activity',
        'admin_marketing_banner','admin_notice','notice_published','inquiry_answered',
        'inbox_message_received','admin_test','missed_call','incoming_call','incoming_call_signal',
        'support_case_created','support_admin_replied','support_customer_replied',
        'support_case_assigned','support_case_resolved','support_case_reopened'
      )
    );
  END IF;
END $$;

COMMIT;
