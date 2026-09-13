import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalBoardMode, ExternalBoardRightsStatus } from "@/lib/external-board-import/product-lock";
import type { ExternalBoardSourceRow } from "@/lib/external-board-import/types";
import { deriveSourceBoardIdentity } from "@/lib/external-board-import/identity/source-board-identity";
import { normalizeRightsStatus } from "@/lib/external-board-import/rights/rights-gate";

function mapSource(row: Record<string, unknown>): ExternalBoardSourceRow {
  return {
    id: String(row.id),
    site_name: String(row.site_name ?? ""),
    source_board_name: String(row.source_board_name ?? ""),
    source_url: String(row.source_url ?? ""),
    site_key: String(row.site_key ?? ""),
    board_key: String(row.board_key ?? ""),
    target_topic_id: row.target_topic_id != null ? String(row.target_topic_id) : null,
    target_topic_slug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
    target_location_id: row.target_location_id != null ? String(row.target_location_id) : null,
    target_region_label: row.target_region_label != null ? String(row.target_region_label) : null,
    mode: (String(row.mode ?? "MANUAL") === "AUTO" ? "AUTO" : "MANUAL") as ExternalBoardMode,
    check_status: (row.check_status as ExternalBoardSourceRow["check_status"]) ?? null,
    check_reasons: Array.isArray(row.check_reasons) ? row.check_reasons : [],
    rights_basis: row.rights_basis != null ? String(row.rights_basis) : null,
    rights_status: normalizeRightsStatus(row.rights_status),
    attribution_required: Boolean(row.attribution_required),
    attribution_display_name:
      row.attribution_display_name != null ? String(row.attribution_display_name) : null,
    board_sequence_verified: Boolean(row.board_sequence_verified),
    author_pool_id: row.author_pool_id != null ? String(row.author_pool_id) : null,
    date_recent_min_days: Number(row.date_recent_min_days ?? 3),
    date_recent_max_days: Number(row.date_recent_max_days ?? 10),
    view_seed_min: Number(row.view_seed_min ?? 100),
    view_seed_max: Number(row.view_seed_max ?? 500),
    last_checked_at: row.last_checked_at != null ? String(row.last_checked_at) : null,
    last_fetched_at: row.last_fetched_at != null ? String(row.last_fetched_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listExternalBoardSources(sb: SupabaseClient): Promise<ExternalBoardSourceRow[]> {
  const { data, error } = await sb
    .from("external_board_sources")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSource(r as Record<string, unknown>));
}

export async function getExternalBoardSource(
  sb: SupabaseClient,
  id: string
): Promise<ExternalBoardSourceRow | null> {
  const { data, error } = await sb.from("external_board_sources").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSource(data as Record<string, unknown>) : null;
}

export type CreateExternalBoardSourceInput = {
  sourceUrl: string;
  sourceBoardName?: string;
  siteName?: string;
  mode?: ExternalBoardMode;
  rightsBasis?: string | null;
  rightsStatus?: ExternalBoardRightsStatus;
  targetTopicId?: string | null;
  targetTopicSlug?: string | null;
  targetLocationId?: string | null;
  targetRegionLabel?: string | null;
  authorPoolId?: string | null;
  attributionRequired?: boolean;
  attributionDisplayName?: string | null;
  boardSequenceVerified?: boolean;
  dateRecentMinDays?: number;
  dateRecentMaxDays?: number;
  viewSeedMin?: number;
  viewSeedMax?: number;
};

/** @deprecated Use CreateExternalBoardSourceInput — create and edit are separate. */
export type UpsertExternalBoardSourceInput = CreateExternalBoardSourceInput;

export const SOURCE_BOARD_ALREADY_REGISTERED = "SOURCE_BOARD_ALREADY_REGISTERED" as const;

export class ExternalBoardSourceDuplicateError extends Error {
  readonly code = SOURCE_BOARD_ALREADY_REGISTERED;
  readonly existingSource: ExternalBoardSourceRow;

  constructor(existingSource: ExternalBoardSourceRow) {
    super(SOURCE_BOARD_ALREADY_REGISTERED);
    this.name = "ExternalBoardSourceDuplicateError";
    this.existingSource = existingSource;
  }
}

function isUniqueIdentityConflict(error: { code?: string; message?: string }): boolean {
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code === "23505") return true;
  return /duplicate|unique/i.test(message) && /site_key|board_key|external_board_sources_identity/i.test(message);
}

async function getExternalBoardSourceByIdentity(
  sb: SupabaseClient,
  siteKey: string,
  boardKey: string
): Promise<ExternalBoardSourceRow | null> {
  const { data, error } = await sb
    .from("external_board_sources")
    .select("*")
    .eq("site_key", siteKey)
    .eq("board_key", boardKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSource(data as Record<string, unknown>) : null;
}

/**
 * Registration CREATE — insert-only.
 * Existing (site_key, board_key) must NOT be mutated; throws ExternalBoardSourceDuplicateError.
 * Legitimate edits use patchExternalBoardSource only.
 */
export async function createExternalBoardSource(
  sb: SupabaseClient,
  input: CreateExternalBoardSourceInput
): Promise<ExternalBoardSourceRow> {
  const identity = deriveSourceBoardIdentity(input.sourceUrl);
  if (!identity) throw new Error("invalid_source_url");

  const rightsStatus = normalizeRightsStatus(input.rightsStatus ?? (input.rightsBasis ? "declared" : "missing"));
  const payload = {
    site_name: String(input.siteName ?? identity.siteName).trim() || identity.siteName,
    source_board_name: String(input.sourceBoardName ?? identity.boardKey).trim() || identity.boardKey,
    source_url: identity.canonicalUrl,
    site_key: identity.siteKey,
    board_key: identity.boardKey,
    mode: input.mode === "AUTO" ? "AUTO" : "MANUAL",
    rights_basis: input.rightsBasis != null ? String(input.rightsBasis).trim() || null : null,
    rights_status: rightsStatus,
    target_topic_id: input.targetTopicId ?? null,
    target_topic_slug: input.targetTopicSlug ?? null,
    target_location_id: input.targetLocationId ?? null,
    target_region_label: input.targetRegionLabel ?? null,
    author_pool_id: input.authorPoolId ?? null,
    attribution_required: Boolean(input.attributionRequired),
    attribution_display_name: input.attributionDisplayName ?? null,
    board_sequence_verified: Boolean(input.boardSequenceVerified),
    date_recent_min_days: input.dateRecentMinDays ?? 3,
    date_recent_max_days: input.dateRecentMaxDays ?? 10,
    view_seed_min: input.viewSeedMin ?? 100,
    view_seed_max: input.viewSeedMax ?? 500,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from("external_board_sources").insert(payload).select("*").single();
  if (error) {
    if (isUniqueIdentityConflict(error)) {
      const existing = await getExternalBoardSourceByIdentity(sb, identity.siteKey, identity.boardKey);
      if (existing) throw new ExternalBoardSourceDuplicateError(existing);
      throw new Error("source_board_duplicate_lookup_miss");
    }
    throw new Error(error.message);
  }
  return mapSource(data as Record<string, unknown>);
}

export async function updateExternalBoardSourceCheck(
  sb: SupabaseClient,
  id: string,
  check: { status: "READY" | "PARTIAL" | "UNSUPPORTED"; reasons: string[] }
): Promise<void> {
  const { error } = await sb
    .from("external_board_sources")
    .update({
      check_status: check.status,
      check_reasons: check.reasons,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function patchExternalBoardSource(
  sb: SupabaseClient,
  id: string,
  patch: Partial<CreateExternalBoardSourceInput>
): Promise<ExternalBoardSourceRow> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.mode) updates.mode = patch.mode === "AUTO" ? "AUTO" : "MANUAL";
  if (patch.rightsBasis !== undefined) updates.rights_basis = patch.rightsBasis;
  if (patch.rightsStatus !== undefined) updates.rights_status = normalizeRightsStatus(patch.rightsStatus);
  if (patch.targetTopicId !== undefined) updates.target_topic_id = patch.targetTopicId;
  if (patch.targetTopicSlug !== undefined) updates.target_topic_slug = patch.targetTopicSlug;
  if (patch.targetLocationId !== undefined) updates.target_location_id = patch.targetLocationId;
  if (patch.targetRegionLabel !== undefined) updates.target_region_label = patch.targetRegionLabel;
  if (patch.authorPoolId !== undefined) updates.author_pool_id = patch.authorPoolId;
  if (patch.attributionRequired !== undefined) updates.attribution_required = Boolean(patch.attributionRequired);
  if (patch.attributionDisplayName !== undefined) {
    updates.attribution_display_name = patch.attributionDisplayName;
  }
  if (patch.boardSequenceVerified !== undefined) {
    updates.board_sequence_verified = Boolean(patch.boardSequenceVerified);
  }
  if (patch.sourceBoardName !== undefined) updates.source_board_name = patch.sourceBoardName;
  if (patch.dateRecentMinDays !== undefined) updates.date_recent_min_days = patch.dateRecentMinDays;
  if (patch.dateRecentMaxDays !== undefined) updates.date_recent_max_days = patch.dateRecentMaxDays;
  if (patch.viewSeedMin !== undefined) updates.view_seed_min = patch.viewSeedMin;
  if (patch.viewSeedMax !== undefined) updates.view_seed_max = patch.viewSeedMax;

  const { data, error } = await sb
    .from("external_board_sources")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapSource(data as Record<string, unknown>);
}
