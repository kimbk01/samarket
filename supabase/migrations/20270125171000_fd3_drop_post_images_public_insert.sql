-- FD3 P1: storage.objects had policy "post-images: allow insert" for PUBLIC
-- with WITH CHECK (bucket_id = 'post-images') only — no auth.uid() path ownership.
-- Anon upload proved reachable (200). Product authenticated upload already has
-- "post-images: authenticated upload to own folder".
--
-- Minimum repair: drop the unauthenticated insert policy.

BEGIN;

DROP POLICY IF EXISTS "post-images: allow insert" ON storage.objects;

COMMIT;
