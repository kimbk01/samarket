-- Hub badge wave1 read-through cache for hub_badge_user_chat_unread_parts (4 fields, RPC-aligned names).

CREATE TABLE IF NOT EXISTS public.hub_badge_user_unread_counters (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  store_order_participant_unread integer NOT NULL DEFAULT 0,
  item_trade_participant_unread integer NOT NULL DEFAULT 0,
  community_participant_unread integer NOT NULL DEFAULT 0,
  product_chat_unread_deduped integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_badge_user_unread_counters IS
  'Read-through snapshot of hub_badge_user_chat_unread_parts per user; refreshed on miss/stale.';
COMMENT ON COLUMN public.hub_badge_user_unread_counters.community_participant_unread IS
  'RPC community_participant_unread — chat_rooms non-trade unread sum (NOT CM tab room count).';

CREATE INDEX IF NOT EXISTS idx_hub_badge_user_unread_counters_updated
  ON public.hub_badge_user_unread_counters (updated_at DESC);

ALTER TABLE public.hub_badge_user_unread_counters ENABLE ROW LEVEL SECURITY;

-- Server service_role only (hub badge cold path). No authenticated policies.
