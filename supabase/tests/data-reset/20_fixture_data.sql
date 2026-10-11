-- Accounts
--   A1/A2 active super admins, X1 revoked admin, T1..T4 testers (3 marker kinds), R1/R2 unclassified real members,
--   O1 operations member, S1 system principal.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('a0000000-0000-0000-0000-000000000001', 'a1@x', '{}'),
 ('a0000000-0000-0000-0000-000000000002', 'a2@x', '{}'),
 ('a0000000-0000-0000-0000-000000000003', 'x1@x', '{}'),
 ('b0000000-0000-0000-0000-000000000001', 't1@x', '{}'),
 ('b0000000-0000-0000-0000-000000000002', 't2@x', '{}'),
 ('b0000000-0000-0000-0000-000000000003', 't3@x', '{"p0_r4_qa":"true"}'),
 ('b0000000-0000-0000-0000-000000000004', 't4@x', '{}'),
 ('c0000000-0000-0000-0000-000000000001', 'r1@x', '{}'),
 ('c0000000-0000-0000-0000-000000000002', 'r2@x', '{}'),
 ('d0000000-0000-0000-0000-000000000001', 'o1@x', '{}'),
 ('e0000000-0000-0000-0000-000000000001', 's1@x', '{"dibay_system_principal":true}');
INSERT INTO auth.sessions (user_id) SELECT id FROM auth.users;
INSERT INTO public.admin_memberships (user_id, status) VALUES
 ('a0000000-0000-0000-0000-000000000001', 'active'), ('a0000000-0000-0000-0000-000000000002', 'active'),
 ('a0000000-0000-0000-0000-000000000003', 'revoked');
INSERT INTO public.profiles (id, nickname, manual_account_type) SELECT id, email,
  CASE WHEN id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004') THEN 'development_member'
       WHEN id = 'd0000000-0000-0000-0000-000000000001' THEN 'operations_member' END
  FROM auth.users;
INSERT INTO public.test_users (id, username, display_name, password) VALUES
 ('b0000000-0000-0000-0000-000000000002', 't2', 'T2', 'not-a-real-secret');
INSERT INTO public.users (id, nickname) VALUES
 ('b0000000-0000-0000-0000-000000000001', 't1'), ('c0000000-0000-0000-0000-000000000001', 'r1');
INSERT INTO public.categories VALUES (1, 'a'), (2, 'b');
INSERT INTO public.settings VALUES ('site_name', 'dibay');

-- Posts: 6,000 tester posts (> 5,000 rows) + special cases
INSERT INTO public.posts (id, user_id, category_id, title, image_url)
SELECT ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'b0000000-0000-0000-0000-000000000001', 1, 't1 post ' || g,
       CASE WHEN g <= 10 THEN 'https://p.supabase.co/storage/v1/object/public/post-images/t1/' || g || '.jpg' END
  FROM generate_series(1, 6000) g;
INSERT INTO public.posts (id, user_id, category_id, title)
SELECT ('20000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'b0000000-0000-0000-0000-000000000002', 2, 't2 post ' || g
  FROM generate_series(1, 10) g;
-- R1 posts; R1 post 1 shares T1 post 1's image (shared image must survive)
INSERT INTO public.posts (id, user_id, category_id, title, image_url) VALUES
 ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 'r1 a',
  'https://p.supabase.co/storage/v1/object/public/post-images/t1/1.jpg'),
 ('30000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 1, 'r1 b',
  'https://p.supabase.co/storage/v1/object/public/post-images/r1/b.jpg');
INSERT INTO public.posts (id, user_id, title) VALUES ('40000000-0000-0000-0000-000000000001', NULL, 'system notice');
INSERT INTO public.posts (id, user_id, title, updated_by_admin_id) VALUES
 ('40000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'admin post', 'a0000000-0000-0000-0000-000000000001');

-- Owner-less post images (soft ref post_id → posts)
INSERT INTO public.post_images (post_id, storage_path)
SELECT ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 't1/img' || g || '.jpg' FROM generate_series(1, 20) g;
INSERT INTO public.post_images (post_id, storage_path) VALUES
 ('30000000-0000-0000-0000-000000000002', 'r1/img.jpg'),
 ('99999999-0000-0000-0000-000000000001', 'orphan/img.jpg');           -- orphan: parent does not exist → kept

-- Comments: R1 comments on T1 post 101 (post 101 kept); T1 comment on T1 post 102 answered by R1 (comment + post kept);
-- T1 comment on R1 post (deleted)
INSERT INTO public.comments (id, post_id, user_id, parent_id, body) VALUES
 (1, '10000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000001', NULL, 'real on tester post'),
 (2, '10000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000001', NULL, 'tester root'),
 (3, '10000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000001', 2, 'real reply'),
 (4, '30000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', NULL, 'tester on real post'),
 (5, '10000000-0000-0000-0000-000000000200', 'b0000000-0000-0000-0000-000000000002', NULL, 'tester on tester');
SELECT setval('public.comments_id_seq', 100);

-- Favorites (composite PK): R1 favorites T1 post 103 (kept); T1 favorites R1 post (deleted)
INSERT INTO public.favorites VALUES
 ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000103'),
 ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
 ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000300');

-- Evidence: R1 reported T1 post 104 (LEGAL_HOLD, soft ref keeps post 104); sanction on T1 (holdAll)
INSERT INTO public.reports (reporter_id, target_id, reason) VALUES
 ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000104', 'spam'),
 ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'tester report');
INSERT INTO public.sanctions (user_id, created_by, note) VALUES
 ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'test sanction');

-- Money: R1 bought T1 post 105 (order KEEP, order_items keeps post 105 via SET NULL FK); T4 buyer order (KEEP → T4 kept)
INSERT INTO public.orders (id, buyer_id, seller_id, amount) VALUES
 ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1000),
 ('50000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 500);
INSERT INTO public.order_items (order_id, post_id, qty) VALUES
 ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000105', 1);
INSERT INTO public.point_ledger (user_id, delta) VALUES
 ('b0000000-0000-0000-0000-000000000001', 10), ('c0000000-0000-0000-0000-000000000001', 20);

-- Chats: T1–T2 room (deleted with messages); R1–T1 room (kept; T1 messages in it kept via followParents)
INSERT INTO public.chat_rooms (id, buyer_id, seller_id, post_id) VALUES
 ('60000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000400'),
 ('60000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
INSERT INTO public.chat_messages (room_id, sender_id, body, attachment) VALUES
 ('60000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'hi', '{"url":"https://p.supabase.co/storage/v1/object/public/chat/t1/a.png"}'),
 ('60000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'yo', NULL),
 ('60000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'tester to real', NULL),
 ('60000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'real to tester', NULL);

-- Stores: T1 store (deleted with products/fees/impressions); R1 store kept; platform fee policy (store_id NULL) kept
INSERT INTO public.stores (id, owner_id, name) VALUES
 ('70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 't1 store'),
 ('70000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'r1 store');
INSERT INTO public.store_products (store_id, category_id, name, image_url) VALUES
 ('70000000-0000-0000-0000-000000000001', 1, 'p1', 'https://p.supabase.co/storage/v1/object/public/store/t1/p1.jpg'),
 ('70000000-0000-0000-0000-000000000002', 1, 'p2', NULL);
INSERT INTO public.store_fee_policies (store_id, fee) VALUES
 (NULL, 3), ('70000000-0000-0000-0000-000000000001', 5), ('70000000-0000-0000-0000-000000000002', 4);
INSERT INTO public.ad_impressions (store_id) VALUES
 ('70000000-0000-0000-0000-000000000001'), ('70000000-0000-0000-0000-000000000002'), (NULL);

-- SPLIT / text owner / wholesale / no-PK / unresolved / lookup-only
INSERT INTO public.audit_logs (user_id, admin_id, action) VALUES
 ('b0000000-0000-0000-0000-000000000001', NULL, 'batch_sync'),
 ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'login'),
 ('c0000000-0000-0000-0000-000000000001', NULL, 'batch_sync');
INSERT INTO public.favorite_audit_log (user_id, post_id) VALUES
 ('b0000000-0000-0000-0000-000000000001', 'x'), ('c0000000-0000-0000-0000-000000000001', 'y');
INSERT INTO public.browse_snapshots (payload) SELECT '{}'::jsonb FROM generate_series(1, 3);
INSERT INTO public.backfill_nopk VALUES (gen_random_uuid(), 'x'), (gen_random_uuid(), 'y');
INSERT INTO public.unresolved_things (user_id) VALUES ('b0000000-0000-0000-0000-000000000001');
INSERT INTO public.lookup_children (category_id) VALUES (1);

-- Storage objects
INSERT INTO storage.objects (bucket_id, name, owner) SELECT 'post-images', 't1/' || g || '.jpg', 'b0000000-0000-0000-0000-000000000001'
  FROM generate_series(1, 9) g;                                   -- t1/10.jpg intentionally missing → object_not_found
INSERT INTO storage.objects (bucket_id, name, owner) SELECT 'post-images', 't1/img' || g || '.jpg', 'b0000000-0000-0000-0000-000000000001'
  FROM generate_series(1, 20) g;
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
 ('post-images', 'r1/b.jpg', 'c0000000-0000-0000-0000-000000000001'),
 ('post-images', 'r1/img.jpg', 'c0000000-0000-0000-0000-000000000001'),
 ('post-images', 'orphan/img.jpg', NULL),
 ('chat', 't1/a.png', 'b0000000-0000-0000-0000-000000000001'),
 ('store', 't1/p1.jpg', 'b0000000-0000-0000-0000-000000000001'),
 ('avatars', 't3/unreferenced.png', 'b0000000-0000-0000-0000-000000000003');   -- tester upload, no row points at it
