import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMUNITY_CRAWL_AUTHOR_POLICIES,
  COMMUNITY_CRAWL_DATE_POLICIES,
  COMMUNITY_CRAWL_INGEST_MODES,
  COMMUNITY_CRAWL_POLICY_STATUSES,
  COMMUNITY_CRAWL_SOURCE_STATUSES,
  COMMUNITY_CRAWL_TYPES,
  COMMUNITY_CRAWL_UPDATE_POLICIES,
  COMMUNITY_CRAWL_VIEW_POLICIES,
  isCommunityCrawlIntervalMinutes,
  normalizeCommunityCrawlPublishMode,
  normalizeHttpBaseUrl,
  normalizeHttpListUrl,
  type CommunityCrawlAuthorPolicy,
  type CommunityCrawlBoardRow,
  type CommunityCrawlDatePolicy,
  type CommunityCrawlIngestMode,
  type CommunityCrawlPolicyStatus,
  type CommunityCrawlRunRow,
  type CommunityCrawlSourceRow,
  type CommunityCrawlSourceStatus,
  type CommunityCrawlType,
  type CommunityCrawlUpdatePolicy,
  type CommunityCrawlViewPolicy,
} from "@/lib/community-crawler/crawl-ssot";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function mapSource(row: Record<string, unknown>): CommunityCrawlSourceRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    base_url: String(row.base_url ?? ""),
    status: (COMMUNITY_CRAWL_SOURCE_STATUSES.includes(row.status as CommunityCrawlSourceStatus)
      ? row.status
      : "ACTIVE") as CommunityCrawlSourceStatus,
    crawler_type: (COMMUNITY_CRAWL_TYPES.includes(row.crawler_type as CommunityCrawlType)
      ? row.crawler_type
      : "generic_html") as CommunityCrawlType,
    adapter_key: row.adapter_key != null ? String(row.adapter_key) : null,
    policy_status: (COMMUNITY_CRAWL_POLICY_STATUSES.includes(row.policy_status as CommunityCrawlPolicyStatus)
      ? row.policy_status
      : "REVIEW_REQUIRED") as CommunityCrawlPolicyStatus,
    publish_mode: normalizeCommunityCrawlPublishMode(row.publish_mode),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapBoard(row: Record<string, unknown>): CommunityCrawlBoardRow {
  const interval = row.crawl_interval_minutes == null ? null : Number(row.crawl_interval_minutes);
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    name: String(row.name ?? ""),
    list_url: String(row.list_url ?? ""),
    enabled: row.enabled === true,
    dibay_topic_id: String(row.dibay_topic_id),
    crawl_mode: (COMMUNITY_CRAWL_TYPES.includes(row.crawl_mode as CommunityCrawlType)
      ? row.crawl_mode
      : "generic_html") as CommunityCrawlType,
    adapter_config: asRecord(row.adapter_config),
    update_policy: (COMMUNITY_CRAWL_UPDATE_POLICIES.includes(row.update_policy as CommunityCrawlUpdatePolicy)
      ? row.update_policy
      : "CREATE_ONLY") as CommunityCrawlUpdatePolicy,
    author_policy: (COMMUNITY_CRAWL_AUTHOR_POLICIES.includes(row.author_policy as CommunityCrawlAuthorPolicy)
      ? row.author_policy
      : "SOURCE_AUTHOR") as CommunityCrawlAuthorPolicy,
    author_config: asRecord(row.author_config),
    date_policy: (COMMUNITY_CRAWL_DATE_POLICIES.includes(row.date_policy as CommunityCrawlDatePolicy)
      ? row.date_policy
      : "SOURCE_DATE") as CommunityCrawlDatePolicy,
    date_config: asRecord(row.date_config),
    view_policy: (COMMUNITY_CRAWL_VIEW_POLICIES.includes(row.view_policy as CommunityCrawlViewPolicy)
      ? row.view_policy
      : "SOURCE_VIEW") as CommunityCrawlViewPolicy,
    view_config: asRecord(row.view_config),
    schedule_enabled: row.schedule_enabled === true,
    crawl_interval_minutes: isCommunityCrawlIntervalMinutes(interval) ? interval : null,
    next_run_at: row.next_run_at != null ? String(row.next_run_at) : null,
    max_pages: Math.max(1, Math.min(50, Number(row.max_pages ?? 3) || 3)),
    max_posts: Math.max(1, Math.min(200, Number(row.max_posts ?? 20) || 20)),
    ingest_mode: (COMMUNITY_CRAWL_INGEST_MODES.includes(row.ingest_mode as CommunityCrawlIngestMode)
      ? row.ingest_mode
      : "REVIEW_THEN_PUBLISH") as CommunityCrawlIngestMode,
    last_run_at: row.last_run_at != null ? String(row.last_run_at) : null,
    last_success_at: row.last_success_at != null ? String(row.last_success_at) : null,
    last_error: row.last_error != null ? String(row.last_error) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapRun(row: Record<string, unknown>): CommunityCrawlRunRow {
  return {
    id: String(row.id),
    board_id: String(row.board_id),
    run_kind: row.run_kind as CommunityCrawlRunRow["run_kind"],
    status: row.status as CommunityCrawlRunRow["status"],
    started_at: String(row.started_at ?? ""),
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    fetched_count: Number(row.fetched_count ?? 0),
    inserted_count: Number(row.inserted_count ?? 0),
    updated_count: Number(row.updated_count ?? 0),
    duplicate_count: Number(row.duplicate_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    error_code: row.error_code != null ? String(row.error_code) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
  };
}

export async function listCommunityCrawlSources(sb: SupabaseClient): Promise<CommunityCrawlSourceRow[]> {
  const { data, error } = await sb
    .from("community_crawl_sources")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map((r) => mapSource(r as Record<string, unknown>)) : [];
}

export async function createCommunityCrawlSource(
  sb: SupabaseClient,
  input: {
    name: string;
    base_url: string;
    status?: CommunityCrawlSourceStatus;
    crawler_type?: CommunityCrawlType;
    adapter_key?: string | null;
    policy_status?: CommunityCrawlPolicyStatus;
  }
): Promise<CommunityCrawlSourceRow> {
  const name = input.name.trim();
  const base_url = normalizeHttpBaseUrl(input.base_url);
  if (!name) throw new Error("name_required");
  if (!base_url) throw new Error("invalid_base_url");
  const { data, error } = await sb
    .from("community_crawl_sources")
    .insert({
      name,
      base_url,
      status: input.status ?? "ACTIVE",
      crawler_type: input.crawler_type ?? "generic_html",
      adapter_key: input.adapter_key?.trim() || null,
      policy_status: input.policy_status ?? "REVIEW_REQUIRED",
      publish_mode: "REFERENCE_SUMMARY",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return mapSource(data as Record<string, unknown>);
}

export async function updateCommunityCrawlSource(
  sb: SupabaseClient,
  id: string,
  patch: Partial<{
    name: string;
    base_url: string;
    status: CommunityCrawlSourceStatus;
    crawler_type: CommunityCrawlType;
    adapter_key: string | null;
    policy_status: CommunityCrawlPolicyStatus;
  }>
): Promise<CommunityCrawlSourceRow> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new Error("name_required");
    next.name = name;
  }
  if (patch.base_url != null) {
    const base_url = normalizeHttpBaseUrl(patch.base_url);
    if (!base_url) throw new Error("invalid_base_url");
    next.base_url = base_url;
  }
  if (patch.status != null) {
    if (!COMMUNITY_CRAWL_SOURCE_STATUSES.includes(patch.status)) throw new Error("invalid_status");
    next.status = patch.status;
  }
  if (patch.crawler_type != null) {
    if (!COMMUNITY_CRAWL_TYPES.includes(patch.crawler_type)) throw new Error("invalid_crawler_type");
    next.crawler_type = patch.crawler_type;
  }
  if (patch.adapter_key !== undefined) next.adapter_key = patch.adapter_key?.trim() || null;
  if (patch.policy_status != null) {
    if (!COMMUNITY_CRAWL_POLICY_STATUSES.includes(patch.policy_status)) throw new Error("invalid_policy_status");
    next.policy_status = patch.policy_status;
  }
  const { data, error } = await sb.from("community_crawl_sources").update(next).eq("id", id).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "update_failed");
  return mapSource(data as Record<string, unknown>);
}

export async function deleteCommunityCrawlSource(sb: SupabaseClient, id: string): Promise<void> {
  // Boards / runs / post_links CASCADE. community_posts are never deleted by this path.
  const { error } = await sb.from("community_crawl_sources").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCommunityCrawlBoards(
  sb: SupabaseClient,
  sourceId?: string
): Promise<CommunityCrawlBoardRow[]> {
  let q = sb.from("community_crawl_boards").select("*").order("updated_at", { ascending: false });
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map((r) => mapBoard(r as Record<string, unknown>)) : [];
}

export async function getCommunityCrawlBoard(
  sb: SupabaseClient,
  id: string
): Promise<CommunityCrawlBoardRow | null> {
  const { data, error } = await sb.from("community_crawl_boards").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBoard(data as Record<string, unknown>) : null;
}

export async function getCommunityCrawlSource(
  sb: SupabaseClient,
  id: string
): Promise<CommunityCrawlSourceRow | null> {
  const { data, error } = await sb.from("community_crawl_sources").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSource(data as Record<string, unknown>) : null;
}

async function assertTopicExists(sb: SupabaseClient, topicId: string): Promise<void> {
  const { data, error } = await sb.from("community_topics").select("id").eq("id", topicId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("dibay_topic_not_found");
}

export async function createCommunityCrawlBoard(
  sb: SupabaseClient,
  input: {
    source_id: string;
    name: string;
    list_url: string;
    dibay_topic_id: string;
    enabled?: boolean;
    crawl_mode?: CommunityCrawlType;
    adapter_config?: Record<string, unknown>;
    update_policy?: CommunityCrawlUpdatePolicy;
    author_policy?: CommunityCrawlAuthorPolicy;
    author_config?: Record<string, unknown>;
    date_policy?: CommunityCrawlDatePolicy;
    date_config?: Record<string, unknown>;
    view_policy?: CommunityCrawlViewPolicy;
    view_config?: Record<string, unknown>;
    schedule_enabled?: boolean;
    crawl_interval_minutes?: number | null;
    max_pages?: number;
    max_posts?: number;
    ingest_mode?: CommunityCrawlIngestMode;
  }
): Promise<CommunityCrawlBoardRow> {
  const name = input.name.trim();
  const list_url = normalizeHttpListUrl(input.list_url);
  if (!name) throw new Error("name_required");
  if (!list_url) throw new Error("invalid_list_url");
  if (!input.source_id?.trim()) throw new Error("source_id_required");
  if (!input.dibay_topic_id?.trim()) throw new Error("dibay_topic_id_required");
  await assertTopicExists(sb, input.dibay_topic_id.trim());

  const interval =
    input.crawl_interval_minutes == null
      ? null
      : isCommunityCrawlIntervalMinutes(input.crawl_interval_minutes)
        ? input.crawl_interval_minutes
        : null;
  if (input.crawl_interval_minutes != null && interval == null) throw new Error("invalid_interval");

  const schedule_enabled = input.schedule_enabled === true;
  const next_run_at =
    schedule_enabled && interval
      ? new Date(Date.now() + interval * 60_000).toISOString()
      : null;

  const { data, error } = await sb
    .from("community_crawl_boards")
    .insert({
      source_id: input.source_id.trim(),
      name,
      list_url,
      dibay_topic_id: input.dibay_topic_id.trim(),
      enabled: input.enabled === true,
      crawl_mode: input.crawl_mode ?? "generic_html",
      adapter_config: input.adapter_config ?? {},
      update_policy: input.update_policy ?? "CREATE_ONLY",
      author_policy: input.author_policy ?? "SOURCE_AUTHOR",
      author_config: input.author_config ?? {},
      date_policy: input.date_policy ?? "SOURCE_DATE",
      date_config: input.date_config ?? {},
      view_policy: input.view_policy ?? "SOURCE_VIEW",
      view_config: input.view_config ?? {},
      schedule_enabled,
      crawl_interval_minutes: schedule_enabled ? interval : null,
      next_run_at,
      max_pages: input.max_pages ?? 3,
      max_posts: input.max_posts ?? 20,
      ingest_mode: input.ingest_mode ?? "REVIEW_THEN_PUBLISH",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return mapBoard(data as Record<string, unknown>);
}

export async function updateCommunityCrawlBoard(
  sb: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
): Promise<CommunityCrawlBoardRow> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    const name = patch.name.trim();
    if (!name) throw new Error("name_required");
    next.name = name;
  }
  if (typeof patch.list_url === "string") {
    const list_url = normalizeHttpListUrl(patch.list_url);
    if (!list_url) throw new Error("invalid_list_url");
    next.list_url = list_url;
  }
  if (typeof patch.dibay_topic_id === "string") {
    const tid = patch.dibay_topic_id.trim();
    if (!tid) throw new Error("dibay_topic_id_required");
    await assertTopicExists(sb, tid);
    next.dibay_topic_id = tid;
  }
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.crawl_mode === "string") {
    if (!COMMUNITY_CRAWL_TYPES.includes(patch.crawl_mode as CommunityCrawlType)) {
      throw new Error("invalid_crawl_mode");
    }
    next.crawl_mode = patch.crawl_mode;
  }
  if (patch.adapter_config && typeof patch.adapter_config === "object") next.adapter_config = patch.adapter_config;
  if (typeof patch.update_policy === "string") {
    if (!COMMUNITY_CRAWL_UPDATE_POLICIES.includes(patch.update_policy as CommunityCrawlUpdatePolicy)) {
      throw new Error("invalid_update_policy");
    }
    next.update_policy = patch.update_policy;
  }
  if (typeof patch.author_policy === "string") {
    if (!COMMUNITY_CRAWL_AUTHOR_POLICIES.includes(patch.author_policy as CommunityCrawlAuthorPolicy)) {
      throw new Error("invalid_author_policy");
    }
    next.author_policy = patch.author_policy;
  }
  if (patch.author_config && typeof patch.author_config === "object") next.author_config = patch.author_config;
  if (typeof patch.date_policy === "string") {
    if (!COMMUNITY_CRAWL_DATE_POLICIES.includes(patch.date_policy as CommunityCrawlDatePolicy)) {
      throw new Error("invalid_date_policy");
    }
    next.date_policy = patch.date_policy;
  }
  if (patch.date_config && typeof patch.date_config === "object") next.date_config = patch.date_config;
  if (typeof patch.view_policy === "string") {
    if (!COMMUNITY_CRAWL_VIEW_POLICIES.includes(patch.view_policy as CommunityCrawlViewPolicy)) {
      throw new Error("invalid_view_policy");
    }
    next.view_policy = patch.view_policy;
  }
  if (patch.view_config && typeof patch.view_config === "object") next.view_config = patch.view_config;
  if (typeof patch.schedule_enabled === "boolean") next.schedule_enabled = patch.schedule_enabled;
  if (patch.crawl_interval_minutes !== undefined) {
    if (patch.crawl_interval_minutes == null) next.crawl_interval_minutes = null;
    else if (!isCommunityCrawlIntervalMinutes(Number(patch.crawl_interval_minutes))) {
      throw new Error("invalid_interval");
    } else next.crawl_interval_minutes = Number(patch.crawl_interval_minutes);
  }
  if (typeof patch.max_pages === "number") next.max_pages = Math.max(1, Math.min(50, patch.max_pages));
  if (typeof patch.max_posts === "number") next.max_posts = Math.max(1, Math.min(200, patch.max_posts));
  if (typeof patch.ingest_mode === "string") {
    if (!COMMUNITY_CRAWL_INGEST_MODES.includes(patch.ingest_mode as CommunityCrawlIngestMode)) {
      throw new Error("invalid_ingest_mode");
    }
    next.ingest_mode = patch.ingest_mode;
  }

  if (next.schedule_enabled === true) {
    const interval = Number(next.crawl_interval_minutes);
    if (isCommunityCrawlIntervalMinutes(interval)) {
      next.next_run_at = new Date(Date.now() + interval * 60_000).toISOString();
    }
  }
  if (next.schedule_enabled === false) {
    next.next_run_at = null;
  }

  const { data, error } = await sb.from("community_crawl_boards").update(next).eq("id", id).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "update_failed");
  return mapBoard(data as Record<string, unknown>);
}

export async function deleteCommunityCrawlBoard(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("community_crawl_boards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCommunityCrawlRuns(
  sb: SupabaseClient,
  opts?: { boardId?: string; limit?: number }
): Promise<CommunityCrawlRunRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  let q = sb.from("community_crawl_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (opts?.boardId) q = q.eq("board_id", opts.boardId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.map((r) => mapRun(r as Record<string, unknown>)) : [];
}
