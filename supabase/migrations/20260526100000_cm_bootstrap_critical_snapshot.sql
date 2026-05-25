-- CMB1: Community messenger bootstrap critical snapshot — segmented unified RPC (1 PostgREST RTT cold path).
-- Semantics aligned with GET /api/community-messenger/bootstrap?lite=1 (rooms bundle + HS5 unread).

CREATE TABLE IF NOT EXISTS public.community_messenger_bootstrap_snapshots (
  user_id uuid NOT NULL,
  bootstrap_scope text NOT NULL DEFAULT 'lite_critical',
  list_limit integer NOT NULL DEFAULT 500,
  cursor_key text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bootstrap_scope, list_limit, cursor_key)
);

COMMENT ON TABLE public.community_messenger_bootstrap_snapshots IS
  'Precomputed CM bootstrap lite critical (rooms + participants + profile labels + HS5 unread). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_cm_bootstrap_snapshots_updated
  ON public.community_messenger_bootstrap_snapshots (updated_at DESC);

ALTER TABLE public.community_messenger_bootstrap_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_cm_bootstrap_critical_snapshot(
  p_user_id uuid,
  p_cursor text DEFAULT '',
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT least(greatest(coalesce(p_limit, 500), 1), 500)::integer AS n
  ),
  lite AS (
    SELECT public.community_messenger_bootstrap_lite_my_rooms_bundle(
      p_user_id,
      (SELECT n FROM cap)
    ) AS j
  ),
  trade_rooms AS (
    SELECT
      (r->>'id')::uuid AS room_id,
      trim(coalesce(r->>'direct_key', '')) AS direct_key
    FROM lite,
      jsonb_array_elements(coalesce(lite.j->'rooms', '[]'::jsonb)) AS r
    WHERE coalesce(r->>'room_type', '') = 'direct'
      AND (
        trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
        OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_item:%'
      )
  ),
  cm_ids AS (
    SELECT coalesce(array_agg(DISTINCT room_id) FILTER (WHERE room_id IS NOT NULL), '{}'::uuid[]) AS ids
    FROM trade_rooms
  ),
  pc_ids AS (
    SELECT coalesce(
      array_agg(DISTINCT (substring(direct_key FROM 10))::uuid)
        FILTER (WHERE direct_key LIKE 'trade_pc:%' AND length(trim(substring(direct_key FROM 10))) > 0),
      '{}'::uuid[]
    ) AS ids
    FROM trade_rooms
    WHERE direct_key LIKE 'trade_pc:%'
  ),
  hs5 AS (
    SELECT public.home_sync_hs5_unread_legacy_bundle(
      (SELECT ids FROM cm_ids),
      (SELECT ids FROM pc_ids)
    ) AS j
  ),
  latest_messages AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'room_id', r->>'id',
          'last_message', r->>'last_message',
          'last_message_at', r->>'last_message_at',
          'last_message_type', r->>'last_message_type'
        )
        ORDER BY r->>'last_message_at' DESC NULLS LAST
      ),
      '[]'::jsonb
    ) AS messages
    FROM lite,
      jsonb_array_elements(coalesce(lite.j->'rooms', '[]'::jsonb)) AS r
  )
  SELECT jsonb_build_object(
    'ok', true,
    'rooms', coalesce(lite.j->'rooms', '[]'::jsonb),
    'unread_snapshot', jsonb_build_object(
      'hs5', (SELECT j FROM hs5),
      'participants', coalesce(lite.j->'participants', '[]'::jsonb)
    ),
    'room_summaries', '[]'::jsonb,
    'latest_messages', (SELECT messages FROM latest_messages),
    'lite_bundle', (SELECT j FROM lite),
    'hs5', (SELECT j FROM hs5),
    'next_cursor', null,
    'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
    'list_limit', (SELECT n FROM cap),
    'updated_at', now()
  )
  FROM lite;
$$;

COMMENT ON FUNCTION public.get_cm_bootstrap_critical_snapshot(uuid, text, integer) IS
  'CMB1 bootstrap lite critical — rooms bundle + HS5 unread in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_cm_bootstrap_critical_snapshot(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_critical_snapshot(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_critical_snapshot(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cm_bootstrap_critical_snapshot(uuid, text, integer) TO service_role;
