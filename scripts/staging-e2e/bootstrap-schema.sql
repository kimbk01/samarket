-- B+ staging bootstrap (CI only, disposable local Supabase).
-- Structure-only snapshot of the production tables the community-import flow touches, read from
-- the production catalog on 2026-10-05 (no rows except app configuration: sections/topics).
-- The full migration history cannot be replayed because some production tables (e.g. chat_rooms)
-- were created outside migrations; see REPORT P.
-- The publish/update RPC is NOT here: the workflow applies the real migration file
-- 20270420120200_community_operator_import_bplus_publish_rpc.sql on top, to verify it.

CREATE TABLE public.admin_settings (
  key text NOT NULL PRIMARY KEY,
  value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by_admin_id uuid
);

CREATE TABLE public.community_sections (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.community_topics (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.community_sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  color text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  is_visible boolean DEFAULT true NOT NULL,
  allow_question boolean DEFAULT true NOT NULL,
  allow_meetup boolean DEFAULT false NOT NULL,
  is_feed_sort boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  feed_list_skin text DEFAULT 'compact_media'::text NOT NULL,
  feed_sort_mode text CHECK (feed_sort_mode IS NULL OR feed_sort_mode = ANY (ARRAY['popular','recommended'])),
  name_en text,
  UNIQUE (section_id, slug)
);

CREATE TABLE public.locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  country text DEFAULT 'PH'::text NOT NULL,
  city text NOT NULL,
  district text DEFAULT ''::text,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  is_sample_data boolean DEFAULT false NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'user'::text,
  manner_temperature numeric(4,1) DEFAULT 36.5 NOT NULL,
  notify_commerce_email boolean DEFAULT true NOT NULL,
  trust_score numeric(5,2) DEFAULT 50 NOT NULL,
  email text, username text, nickname text, avatar_url text, bio text, region_code text, region_name text,
  phone text,
  phone_verified boolean DEFAULT false NOT NULL,
  phone_verification_status text DEFAULT 'unverified'::text NOT NULL,
  phone_verified_at timestamptz, phone_verification_requested_at timestamptz, phone_verification_method text,
  realname text,
  realname_verified boolean DEFAULT false NOT NULL,
  status text DEFAULT 'sns_pending'::text NOT NULL,
  member_type text DEFAULT 'normal'::text NOT NULL,
  is_special_member boolean DEFAULT false NOT NULL,
  points integer DEFAULT 0 NOT NULL,
  manner_score numeric DEFAULT 50 NOT NULL,
  preferred_language text DEFAULT 'ko'::text NOT NULL,
  preferred_country text DEFAULT 'PH'::text NOT NULL,
  auth_provider text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  address_street_line text, address_detail text, latitude double precision, longitude double precision, full_address text,
  trade_presence_last_seen_at timestamptz,
  trade_presence_show_online boolean DEFAULT true NOT NULL,
  trade_presence_hide_last_seen boolean DEFAULT false NOT NULL,
  trade_presence_audience text DEFAULT 'friends'::text NOT NULL,
  display_name text,
  provider text DEFAULT 'email'::text,
  phone_country_code text DEFAULT '+63'::text,
  phone_number text, active_session_id text, last_login_at timestamptz, created_by_admin uuid, auth_login_email text,
  member_status text DEFAULT 'pending'::text,
  is_admin boolean DEFAULT false NOT NULL,
  terms_accepted_at timestamptz, terms_version text, privacy_accepted_at timestamptz, privacy_version text,
  deleted_at timestamptz, deletion_requested_at timestamptz, last_device_info text, manual_account_type text, provider_user_id text,
  phone_verification_attempt_count integer DEFAULT 0 NOT NULL,
  verified_member_at timestamptz,
  username_confirmed boolean DEFAULT false NOT NULL,
  username_set_at timestamptz, username_normalized text,
  profile_completed boolean DEFAULT false NOT NULL,
  dibay_id text,
  dibay_id_locked boolean DEFAULT false NOT NULL,
  onboarding_status text DEFAULT 'pending'::text NOT NULL,
  onboarding_completed_at timestamptz,
  messenger_direct_call_policy text DEFAULT 'everyone'::text NOT NULL,
  dibay_id_auto_assigned boolean DEFAULT false NOT NULL,
  dibay_id_initial text,
  dibay_id_changed_once boolean DEFAULT false NOT NULL,
  dibay_id_changed_at timestamptz,
  admin_tier text
);

CREATE TABLE public.community_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  content text,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  is_hidden boolean DEFAULT false NOT NULL,
  location_id uuid REFERENCES public.locations(id),
  category text CHECK (category IS NULL OR category = ANY (ARRAY['question','info','daily','meetup','food','job','promo','notice','etc'])),
  images jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL,
  report_count integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL CHECK (status IS NULL OR status = ANY (ARRAY['active','hidden','deleted'])),
  is_reported boolean DEFAULT false NOT NULL,
  thumbnail_url text,
  updated_at timestamptz DEFAULT now() NOT NULL,
  is_sample_data boolean DEFAULT false NOT NULL,
  section_id uuid, section_slug text, topic_id uuid, topic_slug text,
  is_question boolean DEFAULT false NOT NULL,
  is_meetup boolean DEFAULT false NOT NULL,
  meetup_date timestamptz, meetup_place text, summary text, region_label text,
  view_count integer DEFAULT 0 NOT NULL,
  like_count integer DEFAULT 0 NOT NULL,
  comment_count integer DEFAULT 0 NOT NULL,
  source_legacy_post_id uuid,
  title text,
  origin_kind text DEFAULT 'member'::text NOT NULL CHECK (origin_kind = ANY (ARRAY['member','admin','imported'])),
  display_author_name text, display_author_avatar_url text,
  published_at timestamptz NOT NULL,
  public_attribution_name text, public_attribution_url text,
  display_date timestamptz
);
CREATE INDEX community_posts_published_at_id_desc_idx ON public.community_posts (published_at DESC, id DESC);

CREATE TABLE public.community_post_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  post_id uuid NOT NULL,
  image_url text,
  storage_path text DEFAULT ''::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX idx_community_post_images_post ON public.community_post_images (post_id, sort_order);

CREATE TABLE public.community_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  content text, user_id uuid,
  created_at timestamptz DEFAULT now(),
  is_hidden boolean DEFAULT false NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL,
  parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  depth integer DEFAULT 0 NOT NULL,
  like_count integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.community_import_principal (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  label text DEFAULT 'community_import'::text NOT NULL CHECK (label = 'community_import'),
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX community_import_principal_singleton ON public.community_import_principal ((true));

CREATE TABLE public.community_operator_import_sources (
  id text NOT NULL PRIMARY KEY,
  display_name text NOT NULL,
  base_url text NOT NULL,
  engine text NOT NULL CHECK (engine = ANY (ARRAY['gnuboard','wordpress_rest','rss_atom','html'])),
  verification text NOT NULL CHECK (verification = ANY (ARRAY['VERIFIED','FULL','PARTIAL','BLOCKED','FAILED','NOT_PROVEN','REJECT'])),
  enabled boolean DEFAULT false NOT NULL,
  priority text DEFAULT 'P1'::text NOT NULL CHECK (priority = ANY (ARRAY['P0','P1','P2'])),
  origin text DEFAULT 'admin'::text NOT NULL CHECK (origin = ANY (ARRAY['seed','admin'])),
  verify_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  reason text, created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  adapter_config jsonb DEFAULT '{}'::jsonb NOT NULL,
  content_policy text DEFAULT 'summary_link'::text NOT NULL CHECK (content_policy = ANY (ARRAY['full','summary_link','link_only'])),
  robots_status text,
  ai_bots_blocked boolean DEFAULT false NOT NULL,
  last_checked_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz, last_error text,
  consecutive_failures integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.community_operator_import_source_boards (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_id text NOT NULL REFERENCES public.community_operator_import_sources(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  display_name text NOT NULL,
  short_label text DEFAULT ''::text NOT NULL,
  category text DEFAULT 'living'::text NOT NULL,
  engine_key text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  collect_enabled boolean DEFAULT false NOT NULL,
  board_kind text DEFAULT 'unknown'::text NOT NULL CHECK (board_kind = ANY (ARRAY['editorial','community','member_qa','directory','ads','unknown'])),
  default_topic_id uuid REFERENCES public.community_topics(id) ON DELETE SET NULL,
  last_checked_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz, last_error text, last_verdict text,
  latest_source_at timestamptz,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  locked_until timestamptz,
  UNIQUE (source_id, board_id)
);

CREATE TABLE public.community_operator_import_inbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_site text NOT NULL, source_board text NOT NULL, source_article_key text NOT NULL,
  canonical_url text NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  author text, source_published_at text, thumbnail_url text,
  fingerprint text DEFAULT ''::text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL CHECK (status = ANY (ARRAY['new','draft','published','source_updated','failed','hidden','skipped'])),
  published_post_id uuid, last_error text,
  collected_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  first_seen_at timestamptz DEFAULT now() NOT NULL,
  last_checked_at timestamptz, last_changed_at timestamptz, source_missing_at timestamptz,
  summary text, quality text,
  quality_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
  UNIQUE (source_site, source_board, source_article_key)
);

CREATE TABLE public.community_operator_import_drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_site text NOT NULL, source_board text NOT NULL, source_article_key text NOT NULL,
  canonical_url text NOT NULL,
  original_json jsonb NOT NULL,
  edit_json jsonb NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL CHECK (status = ANY (ARRAY['draft','published'])),
  published_post_id uuid, updated_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (source_site, source_board, source_article_key)
);

CREATE TABLE public.community_import_post_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  source_site text NOT NULL, source_board text NOT NULL, source_article_key text NOT NULL,
  post_id uuid NOT NULL UNIQUE REFERENCES public.community_posts(id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  content_hash text DEFAULT ''::text NOT NULL,
  content_policy text DEFAULT 'summary_link'::text NOT NULL,
  published_by uuid,
  published_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (source_site, source_board, source_article_key)
);

CREATE TABLE public.community_import_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  scope text DEFAULT 'global'::text NOT NULL CHECK (scope = ANY (ARRAY['global','source','board'])),
  source_site text, source_board text,
  find_text text NOT NULL CHECK (char_length(find_text) >= 1 AND char_length(find_text) <= 500),
  replace_text text DEFAULT ''::text NOT NULL,
  is_regex boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  note text, created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (scope = 'global' OR source_site IS NOT NULL),
  CHECK (scope <> 'board' OR source_board IS NOT NULL)
);

CREATE TABLE public.community_import_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['publish','update','hide','unhide','reprocess'])),
  status text DEFAULT 'queued'::text NOT NULL CHECK (status = ANY (ARRAY['queued','running','done','failed','cancelled'])),
  params jsonb DEFAULT '{}'::jsonb NOT NULL,
  total integer DEFAULT 0 NOT NULL,
  done_count integer DEFAULT 0 NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  skipped_count integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz, finished_at timestamptz, locked_until timestamptz, last_error text
);

CREATE TABLE public.community_import_job_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.community_import_jobs(id) ON DELETE CASCADE,
  source_site text NOT NULL, source_board text NOT NULL, source_article_key text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL CHECK (status = ANY (ARRAY['pending','done','failed','skipped'])),
  message text, post_id uuid,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (job_id, source_site, source_board, source_article_key)
);

-- functions + triggers (verbatim from production)
CREATE OR REPLACE FUNCTION public.community_post_summary_from_content(p_content text, p_max integer DEFAULT 160)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE
  v_text text;
  v_max integer := greatest(1, coalesce(p_max, 160));
BEGIN
  v_text := coalesce(p_content, '');
  v_text := regexp_replace(v_text, '!\[[^]]*\]\([^)]*\)', ' ', 'g');
  v_text := regexp_replace(v_text, '!\[[^]]*\]\([^)]*$', ' ', 'g');
  v_text := regexp_replace(v_text, 'https?://[^[:space:]<>"'']+/storage/v1/object/public/post-images/[^[:space:]<>"'']+', ' ', 'gi');
  v_text := regexp_replace(v_text, 'https?://[^[:space:]<>"'']+\.(jpe?g|png|webp|gif|avif)(\?[^[:space:]<>"'']*)?', ' ', 'gi');
  v_text := btrim(regexp_replace(v_text, '[[:space:]]+', ' ', 'g'));
  IF char_length(v_text) <= v_max THEN
    RETURN v_text;
  END IF;
  RETURN left(v_text, v_max) || '…';
END;
$function$;

CREATE OR REPLACE FUNCTION public.community_posts_set_published_at_from_created()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.published_at IS NULL THEN
    NEW.published_at := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.community_posts_set_summary_from_content()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  NEW.summary := public.community_post_summary_from_content(NEW.content, 160);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.community_posts_sync_legacy_flags()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status = 'deleted' THEN
      NEW.is_deleted := true;
      NEW.is_hidden := false;
    ELSIF NEW.status = 'hidden' THEN
      NEW.is_deleted := false;
      NEW.is_hidden := true;
    ELSIF NEW.status = 'active' OR NEW.status IS NULL THEN
      NEW.is_deleted := false;
      NEW.is_hidden := false;
      IF NEW.status IS NULL THEN
        NEW.status := 'active';
      END IF;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER community_posts_summary_from_content BEFORE INSERT OR UPDATE OF content ON public.community_posts FOR EACH ROW EXECUTE FUNCTION community_posts_set_summary_from_content();
CREATE TRIGGER trg_community_posts_published_at_default BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION community_posts_set_published_at_from_created();
CREATE TRIGGER trg_community_posts_sync_legacy BEFORE INSERT OR UPDATE OF status ON public.community_posts FOR EACH ROW EXECUTE FUNCTION community_posts_sync_legacy_flags();
CREATE TRIGGER community_sections_updated_at BEFORE UPDATE ON public.community_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER community_topics_v2_updated_at BEFORE UPDATE ON public.community_topics FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- app configuration rows (not member data)
INSERT INTO public.community_sections (id, name, slug, sort_order, is_active) VALUES
  ('33b8c2f7-f536-4c97-9a09-113c17573960', '동네생활', 'dongnae', 0, true),
  ('3eb65168-0bad-46cb-8b80-8012fd8973b0', 'dibaY', 'dibay-comunity', 0, true);

INSERT INTO public.community_topics (id, section_id, name, slug, sort_order, allow_question, allow_meetup, is_feed_sort, feed_list_skin, feed_sort_mode, name_en) VALUES
  ('9713440b-a314-459c-9c92-1356458f8377', '33b8c2f7-f536-4c97-9a09-113c17573960', '추천', 'recommended', 1, false, false, true, 'hashtags_below', 'recommended', null),
  ('72596fda-2c04-4e1d-8cf7-01890102bb49', '33b8c2f7-f536-4c97-9a09-113c17573960', '필리핀생할', 'phlifee', 2, true, false, false, 'compact_media', null, null),
  ('e0914e34-e44c-42f7-adcc-8f6cf8c7843a', '33b8c2f7-f536-4c97-9a09-113c17573960', '여행정보', 'travel', 3, true, false, false, 'compact_media', null, null),
  ('dc7875d4-e7ef-4540-8fd3-f8dbcfc22588', '33b8c2f7-f536-4c97-9a09-113c17573960', '일상생활', 'dailylife', 4, true, false, false, 'compact_media', null, null),
  ('c3f76a29-3e69-4ba4-b50a-c0d761e75c70', '33b8c2f7-f536-4c97-9a09-113c17573960', '질문있어요', 'question', 6, true, false, false, 'text_primary', null, null),
  ('c497865c-cc1b-4ec0-8f10-d9b77df014ee', '33b8c2f7-f536-4c97-9a09-113c17573960', '필리핀 뉴스', 'news', 7, true, false, false, 'compact_media', null, null),
  ('b3c76f74-6c33-457c-bcba-575172c86db7', '33b8c2f7-f536-4c97-9a09-113c17573960', '맛집', 'food', 8, true, false, false, 'compact_media', null, 'Food'),
  ('e3e73ebe-ab0a-4e2e-86fc-48c3be2e7552', '33b8c2f7-f536-4c97-9a09-113c17573960', '골프', 'golf', 9, true, false, false, 'compact_media', null, 'Golf'),
  ('73a356de-d7fb-4a60-b78c-d21b6092eb66', '33b8c2f7-f536-4c97-9a09-113c17573960', '유머', 'humor', 10, true, false, false, 'compact_media', null, 'Humor');

-- the RPC migration's backfill reads/writes these; grant like Supabase defaults
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
