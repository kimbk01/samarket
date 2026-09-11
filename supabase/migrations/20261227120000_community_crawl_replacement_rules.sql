-- V2-2: ONE canonical replacement-rule SSOT (exact string only).
-- Never mutates community_crawl_items.source_*.

CREATE TABLE IF NOT EXISTS public.community_crawl_replacement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.community_crawl_sources (id) ON DELETE CASCADE,
  board_id uuid REFERENCES public.community_crawl_boards (id) ON DELETE CASCADE,
  from_text text NOT NULL,
  to_text text NOT NULL,
  apply_title boolean NOT NULL DEFAULT true,
  apply_body boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_crawl_replacement_rules_from_nonempty
    CHECK (char_length(from_text) > 0 AND char_length(from_text) <= 500),
  CONSTRAINT community_crawl_replacement_rules_to_len
    CHECK (char_length(to_text) <= 500),
  CONSTRAINT community_crawl_replacement_rules_from_ne_to
    CHECK (from_text IS DISTINCT FROM to_text),
  CONSTRAINT community_crawl_replacement_rules_apply_any
    CHECK (apply_title OR apply_body)
);

CREATE INDEX IF NOT EXISTS community_crawl_replacement_rules_source_idx
  ON public.community_crawl_replacement_rules (source_id, enabled, priority, created_at, id);

CREATE INDEX IF NOT EXISTS community_crawl_replacement_rules_board_idx
  ON public.community_crawl_replacement_rules (board_id, enabled, priority, created_at, id)
  WHERE board_id IS NOT NULL;

COMMENT ON TABLE public.community_crawl_replacement_rules IS
  'V2-2 exact-string replacement SSOT. board_id set = board-scoped; board_id null = source-scoped. Applied to dibay_* only.';

ALTER TABLE public.community_crawl_replacement_rules ENABLE ROW LEVEL SECURITY;
