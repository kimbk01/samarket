/**
 * Community crawl SSOT contracts (STEP 2).
 * No external fetch / parser here — config + Admin ops only.
 */

export const COMMUNITY_CRAWL_SOURCE_STATUSES = ["ACTIVE", "PAUSED"] as const;
export type CommunityCrawlSourceStatus = (typeof COMMUNITY_CRAWL_SOURCE_STATUSES)[number];

export const COMMUNITY_CRAWL_POLICY_STATUSES = ["ALLOWED", "REVIEW_REQUIRED", "DISABLED"] as const;
export type CommunityCrawlPolicyStatus = (typeof COMMUNITY_CRAWL_POLICY_STATUSES)[number];

/** Image rehost authority — independent of content policy_status. */
export const COMMUNITY_CRAWL_MEDIA_POLICIES = [
  "MEDIA_REVIEW_REQUIRED",
  "MEDIA_ALLOWED",
  "MEDIA_DISABLED",
] as const;
export type CommunityCrawlMediaPolicy = (typeof COMMUNITY_CRAWL_MEDIA_POLICIES)[number];
export const COMMUNITY_CRAWL_DEFAULT_MEDIA_POLICY: CommunityCrawlMediaPolicy = "MEDIA_REVIEW_REQUIRED";

export const COMMUNITY_CRAWL_TYPES = ["generic_html", "custom_adapter"] as const;
export type CommunityCrawlType = (typeof COMMUNITY_CRAWL_TYPES)[number];

export const COMMUNITY_CRAWL_UPDATE_POLICIES = ["CREATE_ONLY", "SYNC_UPDATE"] as const;
export type CommunityCrawlUpdatePolicy = (typeof COMMUNITY_CRAWL_UPDATE_POLICIES)[number];

export const COMMUNITY_CRAWL_AUTHOR_POLICIES = ["SOURCE_AUTHOR", "FIXED", "RANDOM_POOL"] as const;
export type CommunityCrawlAuthorPolicy = (typeof COMMUNITY_CRAWL_AUTHOR_POLICIES)[number];

export const COMMUNITY_CRAWL_DATE_POLICIES = ["SOURCE_DATE", "IMPORT_DATE", "RANDOM_RANGE"] as const;
export type CommunityCrawlDatePolicy = (typeof COMMUNITY_CRAWL_DATE_POLICIES)[number];

export const COMMUNITY_CRAWL_VIEW_POLICIES = ["SOURCE_VIEW", "FIXED", "RANDOM_RANGE"] as const;
export type CommunityCrawlViewPolicy = (typeof COMMUNITY_CRAWL_VIEW_POLICIES)[number];

export const COMMUNITY_CRAWL_INTERVAL_MINUTES = [30, 60, 180, 360, 720, 1440] as const;
export type CommunityCrawlIntervalMinutes = (typeof COMMUNITY_CRAWL_INTERVAL_MINUTES)[number];

export const COMMUNITY_CRAWL_RUN_KINDS = ["TEST", "MANUAL", "SCHEDULED"] as const;
export type CommunityCrawlRunKind = (typeof COMMUNITY_CRAWL_RUN_KINDS)[number];

export const COMMUNITY_CRAWL_RUN_STATUSES = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] as const;
export type CommunityCrawlRunStatus = (typeof COMMUNITY_CRAWL_RUN_STATUSES)[number];

export const COMMUNITY_CRAWL_LINK_SOURCE_STATUSES = ["ACTIVE", "SOURCE_MISSING"] as const;
export type CommunityCrawlLinkSourceStatus = (typeof COMMUNITY_CRAWL_LINK_SOURCE_STATUSES)[number];

export const COMMUNITY_CRAWL_ITEM_STATUSES = [
  "DISCOVERED",
  "READY",
  "REVIEW_REQUIRED",
  "PUBLISHED",
  "FAILED",
  "SKIPPED",
  "SOURCE_MISSING",
] as const;
export type CommunityCrawlItemStatus = (typeof COMMUNITY_CRAWL_ITEM_STATUSES)[number];

export const COMMUNITY_CRAWL_INGEST_MODES = [
  "COLLECT_ONLY",
  "REVIEW_THEN_PUBLISH",
  "AUTO_PUBLISH",
] as const;
export type CommunityCrawlIngestMode = (typeof COMMUNITY_CRAWL_INGEST_MODES)[number];

export {
  COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE,
  COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE,
  COMMUNITY_CRAWL_PUBLISH_MODES,
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
  normalizeCommunityCrawlPublishMode,
  type CommunityCrawlPublishMode,
  type CommunityCrawlV2PublishTarget,
} from "@/lib/community-crawler/publish-mode";

/**
 * Legacy flag: bulk MANUAL without durable items was unavailable.
 * REAL crawl + durable items are available after crawl-items dataset.
 */
export const COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON = "NOT_AVAILABLE_UNTIL_CRAWLER_CORE" as const;

/** TEST crawl: same adapter resolver as REAL; preview only (no crawl_items write). */
export const COMMUNITY_CRAWL_TEST_AVAILABLE = true as const;

/**
 * Legacy STEP4 per-item Manual Import from TEST preview.
 * Operational Admin must not expose this — publish belongs to durable items.
 * Keep API for historical tests; product UI reachability = false.
 */
export const COMMUNITY_CRAWL_MANUAL_IMPORT_AVAILABLE = false as const;

/** REAL crawl → durable community_crawl_items upsert. */
export const COMMUNITY_CRAWL_REAL_CRAWL_AVAILABLE = true as const;

/**
 * V2-0 SSOT freeze: Production cron must not create SCHEDULED crawls until V2-6/V2-7.
 * Board schedule_enabled may remain true in DB — execution is still blocked.
 */
export const COMMUNITY_CRAWL_SCHEDULER_FROZEN = true as const;
export const COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE = "CRAWLER_SCHEDULER_FROZEN" as const;

/** Legacy STEP5 prepare route — retired; Admin must use TEST or REAL crawl only. */
export const COMMUNITY_CRAWL_PREPARE_AVAILABLE = false as const;

export type CommunityCrawlSourceRow = {
  id: string;
  name: string;
  base_url: string;
  status: CommunityCrawlSourceStatus;
  crawler_type: CommunityCrawlType;
  adapter_key: string | null;
  policy_status: CommunityCrawlPolicyStatus;
  /** Image rehost gate — independent of policy_status (content). */
  media_policy: CommunityCrawlMediaPolicy;
  /**
   * Persisted publish_mode (DB CHECK = REFERENCE_SUMMARY until V2-1).
   * V2 operational TARGET = FULL_CONTENT — see COMMUNITY_CRAWL_V2_PUBLISH_TARGET.
   * Current items/[id]/publish still uses legacy REFERENCE_SUMMARY writer until V2-1.
   */
  publish_mode: import("@/lib/community-crawler/publish-mode").CommunityCrawlPublishMode;
  created_at: string;
  updated_at: string;
};

export type CommunityCrawlBoardRow = {
  id: string;
  source_id: string;
  name: string;
  list_url: string;
  enabled: boolean;
  dibay_topic_id: string;
  crawl_mode: CommunityCrawlType;
  adapter_config: Record<string, unknown>;
  update_policy: CommunityCrawlUpdatePolicy;
  author_policy: CommunityCrawlAuthorPolicy;
  author_config: Record<string, unknown>;
  date_policy: CommunityCrawlDatePolicy;
  date_config: Record<string, unknown>;
  view_policy: CommunityCrawlViewPolicy;
  view_config: Record<string, unknown>;
  schedule_enabled: boolean;
  crawl_interval_minutes: CommunityCrawlIntervalMinutes | null;
  next_run_at: string | null;
  max_pages: number;
  max_posts: number;
  ingest_mode: CommunityCrawlIngestMode;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityCrawlItemRow = {
  id: string;
  source_id: string;
  board_id: string;
  run_id: string | null;
  source_post_id: string | null;
  canonical_url: string;
  source_title: string;
  source_body_normalized: string;
  source_author: string | null;
  source_published_at: string | null;
  source_cover_url: string | null;
  /** Raw extracted cover candidate (may be dead). Validated display URL is source_cover_url. */
  source_cover_candidate_url: string | null;
  source_body_images: string[];
  content_fingerprint: string;
  display_author_name: string | null;
  display_author_avatar_url: string | null;
  display_date: string | null;
  display_view_seed: number;
  dibay_title: string;
  dibay_body: string;
  target_topic_id: string;
  status: CommunityCrawlItemStatus;
  manual_override: boolean;
  published_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_crawled_at: string;
  created_at: string;
  updated_at: string;
};

export type CommunityCrawlRunRow = {
  id: string;
  board_id: string;
  run_kind: CommunityCrawlRunKind;
  status: CommunityCrawlRunStatus;
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  inserted_count: number;
  updated_count: number;
  duplicate_count: number;
  skipped_invalid_count: number;
  failed_count: number;
  error_code: string | null;
  error_message: string | null;
};

export type CommunityCrawlAuthorConfig = {
  fixed_display_name?: string;
  fixed_avatar_url?: string;
  random_pool?: Array<{ display_name: string; avatar_url?: string }>;
};

export type CommunityCrawlDateConfig = {
  random_min?: string;
  random_max?: string;
};

export type CommunityCrawlViewConfig = {
  fixed?: number;
  random_min?: number;
  random_max?: number;
};

export function isCommunityCrawlIntervalMinutes(v: unknown): v is CommunityCrawlIntervalMinutes {
  return typeof v === "number" && (COMMUNITY_CRAWL_INTERVAL_MINUTES as readonly number[]).includes(v);
}

export function normalizeHttpBaseUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function normalizeHttpListUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
