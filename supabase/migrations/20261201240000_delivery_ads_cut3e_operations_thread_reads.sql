-- PRODUCT CUT 3-E — Delivery Ads operations thread read cursors (unread authority).
-- UNIQUE(thread_id, reader_role). Server/service_role writes preferred. No campaign lifecycle.

BEGIN;

CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_thread_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL
    REFERENCES public.delivery_ad_operations_threads (id) ON DELETE CASCADE,
  reader_role text NOT NULL
    CHECK (reader_role IN ('owner', 'admin')),
  last_read_message_id uuid NULL
    REFERENCES public.delivery_ad_operations_messages (id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_ops_thread_reads_thread_role_uidx UNIQUE (thread_id, reader_role)
);

CREATE INDEX IF NOT EXISTS delivery_ad_ops_thread_reads_thread_idx
  ON public.delivery_ad_operations_thread_reads (thread_id);

COMMENT ON TABLE public.delivery_ad_operations_thread_reads IS
  'CUT 3-E Delivery Ads ops read-cursor authority: one cursor per thread per owner|admin role. Unread is derived — no parallel counter columns.';

ALTER TABLE public.delivery_ad_operations_thread_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_ad_operations_thread_reads FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_ad_operations_thread_reads FROM anon, authenticated;
GRANT SELECT ON TABLE public.delivery_ad_operations_thread_reads TO authenticated;
GRANT ALL ON TABLE public.delivery_ad_operations_thread_reads TO service_role;

COMMIT;
