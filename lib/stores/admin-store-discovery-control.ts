/**
 * Admin Discovery Control v1 — READ-ONLY projections over closed discovery authorities.
 *
 * IN: rating policy read · campaign monitor read · per-store snapshot read · optional meta diagnostics
 * OUT: ranking writer · sort editor · diversity toggle · pin/boost/ads · first_listed_at override · campaign CRUD
 *
 * Does not invent ranking/explain engines — reuses existing helpers only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_DISCOVERY_CAMPAIGN_TABLE,
  isStoreDiscoveryCampaignActive,
  isStoreDiscoveryCampaignType,
  selectActiveStoreDiscoveryCampaignsForHome,
  type StoreDiscoveryCampaignAuthorityRow,
  type StoreDiscoveryCampaignType,
} from "@/lib/stores/store-discovery-campaign-authority";
import {
  isUsableRatingConfidencePolicy,
  type StoreRatingConfidenceLoadStatus,
} from "@/lib/stores/store-rating-confidence-policy";
import { isNewStoreSignal, NEW_STORE_WINDOW_DAYS } from "@/lib/stores/store-new-store-signal";
import {
  parseCommerceExtrasFromHoursJson,
  type StoreDeliveryFeeMode,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreDiscoveryRankingAuthority } from "@/lib/stores/discovery/store-discovery-ranking-authority";

export const ADMIN_STORE_DISCOVERY_CONTROL_V1 = "read_mostly_only" as const;

export type AdminStoreDiscoveryCampaignMonitorState =
  | "active"
  | "upcoming"
  | "expired"
  | "inactive";

export type AdminStoreDiscoveryCampaignMonitorInput = {
  isActive: boolean;
  startAt: string | null | undefined;
  endAt: string | null | undefined;
  nowMs?: number;
};

/**
 * Monitor classification for Admin Campaign Monitor (read-only).
 * Reuses active authority; adds upcoming/expired/inactive for ops visibility.
 */
export function classifyAdminStoreDiscoveryCampaignMonitorState(
  input: AdminStoreDiscoveryCampaignMonitorInput
): AdminStoreDiscoveryCampaignMonitorState {
  if (input.isActive !== true) return "inactive";
  const startMs = parseInstant(input.startAt);
  const endMs = parseInstant(input.endAt);
  if (startMs == null || endMs == null || !(endMs > startMs)) return "inactive";
  const nowMs = input.nowMs ?? Date.now();
  if (
    isStoreDiscoveryCampaignActive({
      isActive: true,
      startAt: input.startAt,
      endAt: input.endAt,
      nowMs,
    })
  ) {
    return "active";
  }
  if (startMs > nowMs) return "upcoming";
  if (endMs <= nowMs) return "expired";
  return "inactive";
}

export type AdminRatingConfidencePolicyRead = {
  global_mean_rating: number | null;
  prior_weight: number | null;
  rating_count: number | null;
  updated_at: string | null;
  status: StoreRatingConfidenceLoadStatus;
};

export type AdminRatingConfidencePolicyLoadResult = {
  ok: boolean;
  error?: string;
  policy: AdminRatingConfidencePolicyRead | null;
};

/** Admin read of singleton — does not change consumer load path / formula. */
export async function loadAdminRatingConfidencePolicyRead(
  sb: SupabaseClient
): Promise<AdminRatingConfidencePolicyLoadResult> {
  try {
    const { data, error } = await sb
      .from("store_rating_confidence_policy")
      .select("global_mean_rating, prior_weight, rating_count, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      return { ok: false, error: "policy_load_error", policy: null };
    }
    const row =
      (data as {
        global_mean_rating?: unknown;
        prior_weight?: unknown;
        rating_count?: unknown;
        updated_at?: unknown;
      } | null) ?? null;
    const usable = isUsableRatingConfidencePolicy(row);
    const ratingCount =
      row?.rating_count == null || !Number.isFinite(Number(row.rating_count))
        ? null
        : Math.floor(Number(row.rating_count));
    const updatedAt =
      typeof row?.updated_at === "string" && row.updated_at.trim() ? row.updated_at : null;
    if (!usable) {
      return {
        ok: true,
        policy: {
          global_mean_rating:
            row?.global_mean_rating == null || !Number.isFinite(Number(row.global_mean_rating))
              ? null
              : Number(row.global_mean_rating),
          prior_weight:
            row?.prior_weight == null || !Number.isFinite(Number(row.prior_weight))
              ? null
              : Number(row.prior_weight),
          rating_count: ratingCount,
          updated_at: updatedAt,
          status: "fallback_raw",
        },
      };
    }
    return {
      ok: true,
      policy: {
        global_mean_rating: usable.globalMeanRating,
        prior_weight: usable.priorWeight,
        rating_count: ratingCount,
        updated_at: updatedAt,
        status: "active",
      },
    };
  } catch {
    return { ok: false, error: "policy_load_error", policy: null };
  }
}

export type AdminStoreDiscoveryCampaignMonitorRow = {
  id: string;
  store_id: string;
  store_name: string | null;
  campaign_type: StoreDiscoveryCampaignType;
  title: string;
  start_at: string;
  end_at: string;
  is_active: boolean;
  computed_state: AdminStoreDiscoveryCampaignMonitorState;
};

export type AdminStoreDiscoveryCampaignsLoadResult = {
  ok: boolean;
  error?: string;
  now: string;
  campaigns: AdminStoreDiscoveryCampaignMonitorRow[];
};

type CampaignDbRow = {
  id?: unknown;
  store_id?: unknown;
  campaign_type?: unknown;
  title?: unknown;
  body_copy?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  is_active?: unknown;
};

export async function loadAdminStoreDiscoveryCampaignMonitor(
  sb: SupabaseClient,
  opts?: { nowMs?: number; limit?: number }
): Promise<AdminStoreDiscoveryCampaignsLoadResult> {
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  try {
    const { data, error } = await sb
      .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
      .select("id, store_id, campaign_type, title, start_at, end_at, is_active")
      .order("end_at", { ascending: false })
      .limit(limit);
    if (error) {
      return {
        ok: false,
        error: "campaigns_load_error",
        now: new Date(nowMs).toISOString(),
        campaigns: [],
      };
    }
    const rows = (data ?? []) as CampaignDbRow[];
    const storeIds = [
      ...new Set(rows.map((r) => String(r.store_id ?? "").trim()).filter(Boolean)),
    ];
    const nameById = new Map<string, string | null>();
    if (storeIds.length > 0) {
      const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
      for (const s of (stores ?? []) as Array<{ id?: unknown; store_name?: unknown }>) {
        const sid = String(s.id ?? "").trim();
        if (!sid) continue;
        const name = String(s.store_name ?? "").trim();
        nameById.set(sid, name || null);
      }
    }

    const campaigns: AdminStoreDiscoveryCampaignMonitorRow[] = [];
    for (const raw of rows) {
      const id = String(raw.id ?? "").trim();
      const storeId = String(raw.store_id ?? "").trim();
      const title = String(raw.title ?? "").trim();
      const startAt = String(raw.start_at ?? "").trim();
      const endAt = String(raw.end_at ?? "").trim();
      if (!id || !storeId || !title || !startAt || !endAt) continue;
      if (!isStoreDiscoveryCampaignType(raw.campaign_type)) continue;
      const isActive = raw.is_active === true;
      campaigns.push({
        id,
        store_id: storeId,
        store_name: nameById.get(storeId) ?? null,
        campaign_type: raw.campaign_type,
        title,
        start_at: startAt,
        end_at: endAt,
        is_active: isActive,
        computed_state: classifyAdminStoreDiscoveryCampaignMonitorState({
          isActive,
          startAt,
          endAt,
          nowMs,
        }),
      });
    }

    return {
      ok: true,
      now: new Date(nowMs).toISOString(),
      campaigns,
    };
  } catch {
    return {
      ok: false,
      error: "campaigns_load_error",
      now: new Date(nowMs).toISOString(),
      campaigns: [],
    };
  }
}

export type AdminStoreDiscoveryActiveCampaignSummary = {
  id: string;
  campaign_type: StoreDiscoveryCampaignType;
  title: string;
  start_at: string;
  end_at: string;
} | null;

export type AdminStoreDiscoverySnapshot = {
  store_id: string;
  store_name: string | null;
  first_listed_at: string | null;
  new_store_qualifying_now: boolean;
  new_store_window_days: typeof NEW_STORE_WINDOW_DAYS;
  delivery_fee_mode: StoreDeliveryFeeMode | null;
  delivery_fee_strike_reference_php: number | null;
  active_discovery_campaign: AdminStoreDiscoveryActiveCampaignSummary;
};

export type AdminStoreDiscoverySnapshotLoadResult = {
  ok: boolean;
  error?: string;
  snapshot: AdminStoreDiscoverySnapshot | null;
};

export async function loadAdminStoreDiscoverySnapshot(
  sb: SupabaseClient,
  storeId: string,
  opts?: { nowMs?: number }
): Promise<AdminStoreDiscoverySnapshotLoadResult> {
  const id = String(storeId ?? "").trim();
  if (!id) return { ok: false, error: "missing_store_id", snapshot: null };
  const nowMs = opts?.nowMs ?? Date.now();

  try {
    const { data: store, error: storeErr } = await sb
      .from("stores")
      .select("id, store_name, first_listed_at, business_hours_json")
      .eq("id", id)
      .maybeSingle();
    if (storeErr) return { ok: false, error: "store_load_error", snapshot: null };
    if (!store) return { ok: false, error: "store_not_found", snapshot: null };

    const row = store as {
      id?: unknown;
      store_name?: unknown;
      first_listed_at?: unknown;
      business_hours_json?: unknown;
    };
    const firstListedAt =
      typeof row.first_listed_at === "string" && row.first_listed_at.trim()
        ? row.first_listed_at
        : null;
    const extras = parseCommerceExtrasFromHoursJson(row.business_hours_json);

    const campaignLoad = await loadStoreCampaignsForSnapshot(sb, id, nowMs);
    if (campaignLoad.error) {
      return { ok: false, error: campaignLoad.error, snapshot: null };
    }
    const picked = campaignLoad.byStoreId.get(id);
    const activeCampaign: AdminStoreDiscoveryActiveCampaignSummary = picked
      ? {
          id: picked.id,
          campaign_type: picked.campaignType,
          title: picked.title,
          start_at: picked.startAt,
          end_at: picked.endAt,
        }
      : null;

    return {
      ok: true,
      snapshot: {
        store_id: id,
        store_name: String(row.store_name ?? "").trim() || null,
        first_listed_at: firstListedAt,
        new_store_qualifying_now: isNewStoreSignal({ firstListedAt, nowMs }),
        new_store_window_days: NEW_STORE_WINDOW_DAYS,
        delivery_fee_mode: extras.deliveryFeeMode,
        delivery_fee_strike_reference_php: extras.deliveryFeeStrikeReferencePhp,
        active_discovery_campaign: activeCampaign,
      },
    };
  } catch {
    return { ok: false, error: "store_load_error", snapshot: null };
  }
}

async function loadStoreCampaignsForSnapshot(
  sb: SupabaseClient,
  storeId: string,
  nowMs: number
): Promise<{
  byStoreId: Map<string, StoreDiscoveryCampaignAuthorityRow>;
  error?: string;
}> {
  const nowIso = new Date(nowMs).toISOString();
  try {
    const { data, error } = await sb
      .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
      .select("id, store_id, campaign_type, title, body_copy, start_at, end_at, is_active")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .lte("start_at", nowIso)
      .gt("end_at", nowIso);
    if (error) return { byStoreId: new Map(), error: "campaigns_load_error" };
    const authorityRows: StoreDiscoveryCampaignAuthorityRow[] = [];
    for (const raw of (data ?? []) as CampaignDbRow[]) {
      const cid = String(raw.id ?? "").trim();
      const sid = String(raw.store_id ?? "").trim();
      const title = String(raw.title ?? "").trim();
      const startAt = String(raw.start_at ?? "").trim();
      const endAt = String(raw.end_at ?? "").trim();
      if (!cid || !sid || !title || !startAt || !endAt) continue;
      if (!isStoreDiscoveryCampaignType(raw.campaign_type)) continue;
      const bodyRaw = raw.body_copy;
      authorityRows.push({
        id: cid,
        storeId: sid,
        campaignType: raw.campaign_type,
        title,
        bodyCopy:
          bodyRaw == null ? null : String(bodyRaw).trim() ? String(bodyRaw).trim() : null,
        startAt,
        endAt,
        isActive: raw.is_active === true,
      });
    }
    return {
      byStoreId: selectActiveStoreDiscoveryCampaignsForHome(authorityRows, [storeId], nowMs),
    };
  } catch {
    return { byStoreId: new Map(), error: "campaigns_load_error" };
  }
}

/** Optional diagnostics — existing public API meta keys only (no explain engine). */
export type AdminStoreDiscoveryDiagnostics = {
  ranking_authority: ReturnType<typeof resolveStoreDiscoveryRankingAuthority>;
  public_api_meta_keys: {
    browse: readonly string[];
    home_feed: readonly string[];
  };
  note: string;
};

export function buildAdminStoreDiscoveryDiagnostics(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AdminStoreDiscoveryDiagnostics {
  return {
    ranking_authority: resolveStoreDiscoveryRankingAuthority(env),
    public_api_meta_keys: {
      browse: ["ranking_authority", "sorted_by", "rating_confidence", "sort"],
      home_feed: ["ranking_authority", "sorted_by", "discoveryCampaigns.status"],
    },
    note: "Read-only diagnostics from existing public API meta. No per-store rank explain engine.",
  };
}

function parseInstant(value: string | null | undefined): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}
