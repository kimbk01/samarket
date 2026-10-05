/**
 * SOURCE REGISTRY (DB SSOT): community_operator_import_sources + community_operator_import_source_boards.
 * No source or board is hard-coded in engines; adapters read RuntimeSource/RuntimeBoard from here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectResult } from "./detect";
import type {
  AdapterConfig,
  BoardKind,
  ContentPolicy,
  RuntimeBoard,
  RuntimeSource,
  SourceEngine,
} from "./types";

export const SOURCES_TABLE = "community_operator_import_sources";
export const BOARDS_TABLE = "community_operator_import_source_boards";

/** Verdicts that may be switched on for collection. BLOCKED/FAILED/REJECT never. */
export const COLLECTABLE_VERDICTS = new Set(["FULL", "VERIFIED", "PARTIAL"]);
/** Verdicts that may be previewed manually by an admin (NOT_PROVEN = not yet re-checked). */
export const PREVIEWABLE_VERDICTS = new Set(["FULL", "VERIFIED", "PARTIAL", "NOT_PROVEN"]);

export type SourceStatus = {
  verification: string;
  robotsStatus: string | null;
  aiBotsBlocked: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  reason: string | null;
  origin: string;
  priority: string;
};

export type BoardStatus = {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastVerdict: string | null;
  latestSourceAt: string | null;
  consecutiveFailures: number;
};

export type ManagedBoard = RuntimeBoard & { status: BoardStatus };
export type ManagedSource = RuntimeSource & { status: SourceStatus; boards: ManagedBoard[] };

const ENGINES = new Set<SourceEngine>(["gnuboard", "wordpress_rest", "rss_atom", "html"]);
const POLICIES = new Set<ContentPolicy>(["full", "summary_link", "link_only"]);
const KINDS = new Set<BoardKind>(["editorial", "community", "member_qa", "directory", "ads", "unknown"]);

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}

export function mapSourceRow(row: Record<string, unknown>): Omit<ManagedSource, "boards"> {
  const engine = str(row.engine) as SourceEngine;
  const policy = str(row.content_policy) as ContentPolicy;
  return {
    id: str(row.id),
    displayName: str(row.display_name) || str(row.id),
    baseUrl: str(row.base_url),
    engine: ENGINES.has(engine) ? engine : "html",
    enabled: Boolean(row.enabled),
    contentPolicy: POLICIES.has(policy) ? policy : "summary_link",
    adapterConfig: (row.adapter_config && typeof row.adapter_config === "object" ? row.adapter_config : {}) as AdapterConfig,
    verification: str(row.verification) || "NOT_PROVEN",
    status: {
      verification: str(row.verification) || "NOT_PROVEN",
      robotsStatus: strOrNull(row.robots_status),
      aiBotsBlocked: Boolean(row.ai_bots_blocked),
      lastCheckedAt: strOrNull(row.last_checked_at),
      lastSuccessAt: strOrNull(row.last_success_at),
      lastFailureAt: strOrNull(row.last_failure_at),
      lastError: strOrNull(row.last_error),
      consecutiveFailures: Number(row.consecutive_failures) || 0,
      reason: strOrNull(row.reason),
      origin: str(row.origin) || "admin",
      priority: str(row.priority) || "P1",
    },
  };
}

export function mapBoardRow(row: Record<string, unknown>): ManagedBoard {
  const kind = str(row.board_kind) as BoardKind;
  return {
    sourceId: str(row.source_id),
    boardId: str(row.board_id),
    displayName: str(row.display_name) || str(row.board_id),
    shortLabel: str(row.short_label) || str(row.board_id),
    category: str(row.category) || "living",
    engineKey: str(row.engine_key),
    enabled: Boolean(row.enabled),
    collectEnabled: Boolean(row.collect_enabled),
    boardKind: KINDS.has(kind) ? kind : "unknown",
    defaultTopicId: strOrNull(row.default_topic_id),
    status: {
      lastCheckedAt: strOrNull(row.last_checked_at),
      lastSuccessAt: strOrNull(row.last_success_at),
      lastFailureAt: strOrNull(row.last_failure_at),
      lastError: strOrNull(row.last_error),
      lastVerdict: strOrNull(row.last_verdict),
      latestSourceAt: strOrNull(row.latest_source_at),
      consecutiveFailures: Number(row.consecutive_failures) || 0,
    },
  };
}

/** All sources with their boards (2 queries, no N+1). */
export async function loadManagedSources(sb: SupabaseClient): Promise<ManagedSource[]> {
  const [{ data: srcRows, error: se }, { data: boardRows, error: be }] = await Promise.all([
    sb.from(SOURCES_TABLE).select("*").order("display_name", { ascending: true }),
    sb.from(BOARDS_TABLE).select("*").order("board_id", { ascending: true }),
  ]);
  if (se) throw new Error(`sources_load_failed: ${se.message}`);
  if (be) throw new Error(`boards_load_failed: ${be.message}`);
  const bySource = new Map<string, ManagedBoard[]>();
  for (const r of boardRows || []) {
    const b = mapBoardRow(r as Record<string, unknown>);
    const list = bySource.get(b.sourceId) || [];
    list.push(b);
    bySource.set(b.sourceId, list);
  }
  return (srcRows || []).map((r) => {
    const s = mapSourceRow(r as Record<string, unknown>);
    return { ...s, boards: bySource.get(s.id) || [] };
  });
}

export async function loadManagedSource(sb: SupabaseClient, sourceId: string): Promise<ManagedSource | null> {
  const [{ data: src, error: se }, { data: boards, error: be }] = await Promise.all([
    sb.from(SOURCES_TABLE).select("*").eq("id", sourceId).maybeSingle(),
    sb.from(BOARDS_TABLE).select("*").eq("source_id", sourceId).order("board_id"),
  ]);
  if (se) throw new Error(se.message);
  if (be) throw new Error(be.message);
  if (!src) return null;
  return {
    ...mapSourceRow(src as Record<string, unknown>),
    boards: (boards || []).map((b) => mapBoardRow(b as Record<string, unknown>)),
  };
}

export type ResolvedPair = { source: ManagedSource; board: ManagedBoard };

/** Source+board for manual admin preview. Refuses disabled or BLOCKED/FAILED sources. */
export async function resolvePreviewPair(
  sb: SupabaseClient,
  sourceId: string,
  boardId: string,
): Promise<ResolvedPair> {
  const source = await loadManagedSource(sb, sourceId);
  if (!source) throw new Error("source_not_found");
  if (!PREVIEWABLE_VERDICTS.has(source.verification)) throw new Error(`source_${source.verification.toLowerCase()}`);
  const board = source.boards.find((b) => b.boardId === boardId);
  if (!board) throw new Error("board_not_found");
  return { source, board };
}

function normalizeSourceId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Save a detection result as a source + its real discovered boards.
 * Boards: insert new, refresh labels/keys of existing ones; never delete boards (their inbox rows stay valid).
 * `enabled` is only honored for collectable verdicts.
 */
export async function saveDetectedSource(
  sb: SupabaseClient,
  input: {
    detect: DetectResult;
    sourceId?: string;
    displayName?: string;
    contentPolicy?: ContentPolicy;
    selectedBoardIds?: string[];
    adminUserId: string;
  },
): Promise<ManagedSource> {
  const d = input.detect;
  if (!d.engine) throw new Error(`cannot_register:${d.verdict}`);
  if (d.verdict === "BLOCKED") throw new Error("cannot_register:BLOCKED");
  const id = normalizeSourceId(input.sourceId || d.sourceIdSuggestion);
  if (!id) throw new Error("source_id_required");
  const now = new Date().toISOString();
  const policy = input.contentPolicy && POLICIES.has(input.contentPolicy) ? input.contentPolicy : "summary_link";

  const { data: existing } = await sb.from(SOURCES_TABLE).select("id, origin, enabled").eq("id", id).maybeSingle();
  const payload: Record<string, unknown> = {
    id,
    display_name: (input.displayName || d.displayNameSuggestion || id).trim().slice(0, 120) || id,
    base_url: d.baseUrl,
    engine: d.engine,
    verification: d.verdict,
    adapter_config: d.adapterConfig || {},
    content_policy: policy,
    robots_status: d.robots.status,
    ai_bots_blocked: d.robots.aiBotsBlocked,
    verify_json: d as unknown as Record<string, unknown>,
    reason: d.reason,
    last_checked_at: d.checkedAt,
    updated_at: now,
  };
  if (d.verdict === "FULL" || d.verdict === "PARTIAL") {
    payload.last_success_at = now;
    payload.consecutive_failures = 0;
    payload.last_error = null;
  } else {
    payload.last_failure_at = now;
    payload.last_error = d.reason;
  }
  if (!existing) {
    payload.origin = "admin";
    payload.priority = "P1";
    payload.created_by = input.adminUserId;
    payload.enabled = COLLECTABLE_VERDICTS.has(d.verdict);
  } else if (!COLLECTABLE_VERDICTS.has(d.verdict) && d.verdict !== "NOT_PROVEN") {
    payload.enabled = false;
  }
  const { error } = await sb.from(SOURCES_TABLE).upsert(payload, { onConflict: "id" });
  if (error) throw new Error(`source_save_failed: ${error.message}`);

  await upsertDetectedBoards(sb, id, d, input.selectedBoardIds);
  const saved = await loadManagedSource(sb, id);
  if (!saved) throw new Error("source_readback_failed");
  return saved;
}

/** Insert/refresh discovered boards. Selected boards (or all FULL/PARTIAL editorial boards) become enabled. */
export async function upsertDetectedBoards(
  sb: SupabaseClient,
  sourceId: string,
  d: DetectResult,
  selectedBoardIds?: string[],
): Promise<void> {
  if (!d.boards.length) return;
  const { data: existingRows } = await sb.from(BOARDS_TABLE).select("board_id, enabled, collect_enabled").eq("source_id", sourceId);
  const existing = new Map((existingRows || []).map((r) => [String((r as { board_id: string }).board_id), r]));
  const selected = selectedBoardIds ? new Set(selectedBoardIds) : null;
  const now = new Date().toISOString();
  const rows = d.boards.map((b) => {
    const prev = existing.get(b.boardId) as { enabled?: boolean } | undefined;
    const sampleVerdict = b.sample?.verdict ?? null;
    const usable = b.robotsAllowed && (sampleVerdict === "FULL" || sampleVerdict === "PARTIAL");
    const enabled = selected ? selected.has(b.boardId) && usable : prev ? Boolean(prev.enabled) : usable && b.boardKind === "editorial";
    const row: Record<string, unknown> = {
      source_id: sourceId,
      board_id: b.boardId,
      display_name: b.displayName.slice(0, 120),
      short_label: b.displayName.slice(0, 40),
      engine_key: b.engineKey,
      board_kind: b.boardKind,
      enabled,
      last_checked_at: now,
      last_verdict: b.robotsAllowed ? sampleVerdict : "BLOCKED",
      latest_source_at: b.sample?.latestAt ?? null,
      last_error: b.sample && b.sample.verdict !== "FULL" ? b.sample.reasons.join(", ").slice(0, 500) || null : null,
      updated_at: now,
    };
    if (usable) row.last_success_at = now;
    else row.last_failure_at = now;
    return row;
  });
  const { error } = await sb.from(BOARDS_TABLE).upsert(rows, { onConflict: "source_id,board_id" });
  if (error) throw new Error(`boards_save_failed: ${error.message}`);
}

export type SourcePatch = {
  displayName?: string;
  enabled?: boolean;
  contentPolicy?: ContentPolicy;
  adapterConfig?: AdapterConfig;
};

export async function updateSource(sb: SupabaseClient, sourceId: string, patch: SourcePatch): Promise<ManagedSource> {
  const current = await loadManagedSource(sb, sourceId);
  if (!current) throw new Error("source_not_found");
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName != null) row.display_name = String(patch.displayName).trim().slice(0, 120) || current.displayName;
  if (patch.contentPolicy != null) {
    if (!POLICIES.has(patch.contentPolicy)) throw new Error("invalid_content_policy");
    row.content_policy = patch.contentPolicy;
  }
  if (patch.adapterConfig != null) row.adapter_config = sanitizeAdapterConfig(patch.adapterConfig);
  if (patch.enabled != null) {
    if (patch.enabled && !PREVIEWABLE_VERDICTS.has(current.verification)) {
      throw new Error(`cannot_enable_${current.verification.toLowerCase()}`);
    }
    row.enabled = Boolean(patch.enabled);
  }
  const { error } = await sb.from(SOURCES_TABLE).update(row).eq("id", sourceId);
  if (error) throw new Error(error.message);
  const saved = await loadManagedSource(sb, sourceId);
  if (!saved) throw new Error("source_readback_failed");
  return saved;
}

export type BoardPatch = {
  enabled?: boolean;
  collectEnabled?: boolean;
  defaultTopicId?: string | null;
  displayName?: string;
  boardKind?: BoardKind;
};

export async function updateBoard(
  sb: SupabaseClient,
  sourceId: string,
  boardId: string,
  patch: BoardPatch,
): Promise<ManagedBoard> {
  const source = await loadManagedSource(sb, sourceId);
  if (!source) throw new Error("source_not_found");
  const board = source.boards.find((b) => b.boardId === boardId);
  if (!board) throw new Error("board_not_found");
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName != null) {
    row.display_name = String(patch.displayName).trim().slice(0, 120) || board.displayName;
    row.short_label = String(row.display_name).slice(0, 40);
  }
  if (patch.boardKind != null) {
    if (!KINDS.has(patch.boardKind)) throw new Error("invalid_board_kind");
    row.board_kind = patch.boardKind;
  }
  if (patch.defaultTopicId !== undefined) row.default_topic_id = patch.defaultTopicId || null;
  if (patch.enabled != null) row.enabled = Boolean(patch.enabled);
  if (patch.collectEnabled != null) {
    if (patch.collectEnabled) {
      if (!COLLECTABLE_VERDICTS.has(source.verification)) {
        throw new Error(`collect_requires_verified_source:${source.verification}`);
      }
      const kind = (patch.boardKind ?? board.boardKind) as BoardKind;
      if (kind === "member_qa" || kind === "ads") throw new Error(`collect_forbidden_board_kind:${kind}`);
      if (board.status.lastVerdict === "BLOCKED" || board.status.lastVerdict === "FAILED") {
        throw new Error(`collect_requires_working_board:${board.status.lastVerdict}`);
      }
      row.enabled = true;
    }
    row.collect_enabled = Boolean(patch.collectEnabled);
  }
  const { error } = await sb.from(BOARDS_TABLE).update(row).eq("source_id", sourceId).eq("board_id", boardId);
  if (error) throw new Error(error.message);
  const after = await loadManagedSource(sb, sourceId);
  const saved = after?.boards.find((b) => b.boardId === boardId);
  if (!saved) throw new Error("board_readback_failed");
  return saved;
}

export function sanitizeAdapterConfig(raw: AdapterConfig): AdapterConfig {
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim())
          .filter((x) => x && x.length <= 200)
          .slice(0, 12)
      : undefined;
  const out: AdapterConfig = {};
  const body = list(raw.bodySelectors);
  if (body?.length) out.bodySelectors = body;
  const rm = list(raw.removeSelectors);
  if (rm?.length) out.removeSelectors = rm;
  const att = list(raw.attachmentSelectors);
  if (att?.length) out.attachmentSelectors = att;
  if (raw.dateSelector) out.dateSelector = String(raw.dateSelector).slice(0, 200);
  if (raw.itemUrlTemplate) out.itemUrlTemplate = String(raw.itemUrlTemplate).slice(0, 300);
  if (raw.fetchArticle === false) out.fetchArticle = false;
  return out;
}

/** Record a collection/verification outcome for a source and board. */
export async function recordBoardOutcome(
  sb: SupabaseClient,
  input: {
    sourceId: string;
    boardId: string;
    ok: boolean;
    verdict?: string | null;
    error?: string | null;
    latestSourceAt?: string | null;
    prevFailures: number;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { last_checked_at: now, updated_at: now, locked_until: null };
  if (input.ok) {
    row.last_success_at = now;
    row.consecutive_failures = 0;
    row.last_error = null;
    if (input.latestSourceAt) row.latest_source_at = input.latestSourceAt;
  } else {
    row.last_failure_at = now;
    row.consecutive_failures = input.prevFailures + 1;
    row.last_error = String(input.error || "unknown").slice(0, 500);
  }
  if (input.verdict) row.last_verdict = input.verdict;
  await sb.from(BOARDS_TABLE).update(row).eq("source_id", input.sourceId).eq("board_id", input.boardId);
}

export async function recordSourceOutcome(
  sb: SupabaseClient,
  input: { sourceId: string; ok: boolean; error?: string | null; prevFailures: number },
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { last_checked_at: now, updated_at: now };
  if (input.ok) {
    row.last_success_at = now;
    row.consecutive_failures = 0;
    row.last_error = null;
  } else {
    row.last_failure_at = now;
    row.consecutive_failures = input.prevFailures + 1;
    row.last_error = String(input.error || "unknown").slice(0, 500);
  }
  await sb.from(SOURCES_TABLE).update(row).eq("id", input.sourceId);
}

/**
 * Take a short lease on a board so overlapping cron runs never collect the same board twice.
 * Returns false when another run holds the lease.
 */
export async function tryLockBoard(sb: SupabaseClient, sourceId: string, boardId: string, seconds: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + seconds * 1000).toISOString();
  const { data, error } = await sb
    .from(BOARDS_TABLE)
    .update({ locked_until: until })
    .eq("source_id", sourceId)
    .eq("board_id", boardId)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select("board_id");
  if (error) return false;
  return Array.isArray(data) && data.length === 1;
}

/**
 * Operator-defined board (e.g. a feed narrowed by keyword: `https://site/rss#keyword=필리핀,세부`).
 * Starts disabled for scheduled collection; sample it first, then switch collection on.
 */
export async function addCustomBoard(
  sb: SupabaseClient,
  sourceId: string,
  input: { displayName: string; engineKey: string; boardKind?: BoardKind; defaultTopicId?: string | null },
): Promise<ManagedBoard> {
  const source = await loadManagedSource(sb, sourceId);
  if (!source) throw new Error("source_not_found");
  const name = String(input.displayName || "").trim().slice(0, 120);
  const key = String(input.engineKey || "").trim().slice(0, 1000);
  if (!name || !key) throw new Error("board_name_and_key_required");
  try {
    const u = new URL(key, source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`);
    if (u.host.replace(/^www\./, "") !== new URL(source.baseUrl).host.replace(/^www\./, "")) throw new Error("board_must_be_on_source_host");
  } catch (e) {
    throw e instanceof Error && e.message === "board_must_be_on_source_host" ? e : new Error("invalid_board_url");
  }
  const kind = input.boardKind && KINDS.has(input.boardKind) ? input.boardKind : "editorial";
  const boardId = `custom-${createHashId(key)}`;
  const { error } = await sb.from(BOARDS_TABLE).upsert(
    {
      source_id: sourceId,
      board_id: boardId,
      display_name: name,
      short_label: name.slice(0, 40),
      engine_key: key,
      board_kind: kind,
      enabled: true,
      collect_enabled: false,
      default_topic_id: input.defaultTopicId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_id,board_id" },
  );
  if (error) throw new Error(error.message);
  const after = await loadManagedSource(sb, sourceId);
  const saved = after?.boards.find((b) => b.boardId === boardId);
  if (!saved) throw new Error("board_readback_failed");
  return saved;
}

function createHashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
