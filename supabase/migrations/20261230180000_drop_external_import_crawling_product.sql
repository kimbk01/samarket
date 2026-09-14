-- PHASE A: DROP exclusive External Import / Crawling product DB objects.
-- Provenance: created only by prior external-import / external-board / community-crawl / board-import migrations.
-- Does NOT drop community_posts / community_topics / Community core.
-- Does NOT drop community_posts.origin_kind / display_date / display_author_* columns
--   (may still be present on existing Community rows; code no longer writes new import product rows).

-- Current external-import (Crawlee) generation
drop function if exists public.claim_external_import_job(text);

drop table if exists public.external_publish_links cascade;
drop table if exists public.external_auth_sessions cascade;
drop table if exists public.external_article_documents cascade;
drop table if exists public.external_articles cascade;
drop table if exists public.external_import_jobs cascade;
drop table if exists public.external_boards cascade;
drop table if exists public.external_sites cascade;

-- Prior external-board generation
drop table if exists public.external_board_publish_claims cascade;
drop table if exists public.external_board_replacement_rules cascade;
drop table if exists public.external_board_media_assets cascade;
drop table if exists public.external_board_articles cascade;
drop table if exists public.external_board_sources cascade;
drop table if exists public.external_board_author_aliases cascade;
drop table if exists public.external_board_author_pools cascade;
drop table if exists public.external_board_source_sessions cascade;

-- Prior community-crawl generation
drop function if exists public.community_crawl_manual_import_reference_summary(uuid);
drop function if exists public.community_crawl_manual_import_reference_summary cascade;
drop function if exists public.community_crawl_publish_full_content(uuid, uuid, text, text, text, text, text, integer, boolean);
drop function if exists public.community_crawl_publish_full_content cascade;

drop table if exists public.community_crawl_replacement_rules cascade;
drop table if exists public.community_crawl_item_media cascade;
drop table if exists public.community_crawl_run_events cascade;
drop table if exists public.community_crawl_items cascade;
drop table if exists public.community_crawl_post_links cascade;
drop table if exists public.community_crawl_runs cascade;
drop table if exists public.community_crawl_boards cascade;
drop table if exists public.community_crawl_sources cascade;

-- Prior board-import generation
drop function if exists public.board_import_claim_publish(uuid, uuid);
drop function if exists public.board_import_claim_publish;
drop function if exists public.board_import_publish_article;
drop function if exists public.board_import_publish_article(uuid, uuid, text, text, text, text, text, integer, boolean);

drop table if exists public.board_import_replacement_rules cascade;
drop table if exists public.board_import_articles cascade;
drop table if exists public.board_import_sources cascade;
