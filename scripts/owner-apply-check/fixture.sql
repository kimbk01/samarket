-- Mirrors the production state reviewed 2026-10-05 for the owner apply script (ids are production ids,
-- content is synthetic): 3 published legacy drafts + their posts + 3 inbox rows, plus decoy rows that
-- must never change.
insert into public.community_posts (id, title, content, status, origin_kind, images, created_at) values
 ('9e794acc-f152-4260-98d2-d32d07abbd85', 'legacy cesimo', 'x', 'active', 'imported', '["https://e.x/a.webp"]', now() - interval '20 days'),
 ('2ed070f4-98a0-4467-a530-9065f99427ab', 'legacy philsamo', 'x', 'active', 'imported', '[]', now() - interval '20 days'),
 ('21379aff-dda2-4d54-bf01-4d6f282d60a5', 'legacy philstar', 'x', 'active', 'imported', '[]', now() - interval '20 days'),
 ('11111111-0000-4000-8000-000000000001', 'member post', 'x', 'active', 'member', '[]', now() - interval '2 days'),
 ('11111111-0000-4000-8000-000000000002', 'legacy w/o draft', 'x', 'active', 'imported', '[]', now() - interval '2 days');
insert into public.community_post_images (post_id, image_url, sort_order) values
 ('9e794acc-f152-4260-98d2-d32d07abbd85', 'https://e.x/a.webp', 0),
 ('11111111-0000-4000-8000-000000000001', 'https://e.x/m.webp', 0);
insert into public.community_operator_import_drafts (id, source_site, source_board, source_article_key, canonical_url, original_json, edit_json, status, published_post_id, updated_at) values
 ('0c9c6257-43f5-440e-a65c-54aaa8863909', 'cesimo', 'feed', '6305e843c7a326ff', 'https://cesimo.tistory.com/329', '{}', '{}', 'published', '9e794acc-f152-4260-98d2-d32d07abbd85', '2026-09-14 23:30:36+00'),
 ('66b18af6-f02b-4bac-8d8a-f73587bba0ac', 'philsamo', 'travel', '71', 'https://philsamo.com/bbs/board.php?bo_table=travel&wr_id=71', '{}', '{}', 'published', '2ed070f4-98a0-4467-a530-9065f99427ab', '2026-09-14 16:51:26+00'),
 ('51ff2b5e-cade-4ffb-ac58-c79394dd5099', 'philstar', 'headlines', '2556331', 'https://www.philstar.com/headlines/2026/09/15/2556331/x', '{}', '{}', 'published', '21379aff-dda2-4d54-bf01-4d6f282d60a5', '2026-09-14 16:55:10+00');
insert into public.community_operator_import_inbox (id, source_site, source_board, source_article_key, canonical_url, title, status) values
 ('6dc87a9f-53d9-4f73-b02a-77cd531619c2', 'cesimo', 'feed', '6305e843c7a326ff', 'https://cesimo.tistory.com/329', 'c', 'new'),
 ('00829cb7-c665-445d-9291-ae257533e1fd', 'philsamo', 'travel', '71', 'https://philsamo.com/bbs/board.php?bo_table=travel&wr_id=71', 'p', 'source_updated'),
 ('dbc4ffc7-ad8c-4d11-9162-4e3aede50847', 'philstar', 'headlines', '2556331', 'https://www.philstar.com/headlines/2026/09/15/2556331/x', 's', 'new'),
 ('22222222-0000-4000-8000-000000000001', 'hellocebuph', 'destinations', 'k1', 'https://hellocebuph.com/x', 'decoy', 'new');
