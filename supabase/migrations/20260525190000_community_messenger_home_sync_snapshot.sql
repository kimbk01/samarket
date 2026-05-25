-- Community messenger home-sync critical: single-RPC snapshot (1 PostgREST RTT cold path).
-- Semantics aligned with listCommunityMessengerMyChatsAndGroups tier=critical + HS5 unread merge.

CREATE TABLE IF NOT EXISTS public.community_messenger_home_sync_snapshots (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'critical',
  room_cap integer NOT NULL DEFAULT 20,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_messenger_home_sync_snapshots IS
  'Precomputed home-sync critical payload (lite rooms bundle + HS5 legacy unread rows). Event-driven refresh; read path 1 PK select.';

COMMENT ON COLUMN public.community_messenger_home_sync_snapshots.payload_json IS
  'JSON: { lite_bundle, hs5 } from get_community_messenger_home_sync_snapshot RPC.';

CREATE INDEX IF NOT EXISTS idx_cm_home_sync_snapshots_updated
  ON public.community_messenger_home_sync_snapshots (updated_at DESC);

ALTER TABLE public.community_messenger_home_sync_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_community_messenger_home_sync_snapshot(
  p_user_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT least(greatest(coalesce(p_limit, 20), 1), 30)::integer AS n
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
  )
  SELECT jsonb_build_object(
    'lite_bundle', (SELECT j FROM lite),
    'hs5', (SELECT j FROM hs5),
    'room_cap', (SELECT n FROM cap)
  );
$$;

COMMENT ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) IS
  'Home-sync critical cold path — lite rooms bundle + HS5 legacy unread in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_messenger_home_sync_snapshot(uuid, integer) TO service_role;
