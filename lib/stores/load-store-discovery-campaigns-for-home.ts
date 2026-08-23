import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_DISCOVERY_CAMPAIGN_TABLE,
  isStoreDiscoveryCampaignType,
  selectActiveStoreDiscoveryCampaignsForHome,
  type StoreDiscoveryCampaignAuthorityRow,
} from "@/lib/stores/store-discovery-campaign-authority";

export type StoreDiscoveryCampaignHomeLoadStatus = "ok" | "error";

export type StoreDiscoveryCampaignHomeLoadResult = {
  status: StoreDiscoveryCampaignHomeLoadStatus;
  /** One active campaign per candidate store (deterministic). Empty when ok+none or error. */
  byStoreId: Map<string, StoreDiscoveryCampaignAuthorityRow>;
};

type DbRow = {
  id?: unknown;
  store_id?: unknown;
  campaign_type?: unknown;
  title?: unknown;
  body_copy?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  is_active?: unknown;
};

function parseDbRow(raw: DbRow): StoreDiscoveryCampaignAuthorityRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const campaignType = raw.campaign_type;
  const title = String(raw.title ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !storeId || !title || !startAt || !endAt) return null;
  if (!isStoreDiscoveryCampaignType(campaignType)) return null;
  const bodyRaw = raw.body_copy;
  const bodyCopy =
    bodyRaw == null ? null : String(bodyRaw).trim() ? String(bodyRaw).trim() : null;
  return {
    id,
    storeId,
    campaignType,
    title,
    bodyCopy,
    startAt,
    endAt,
    isActive: raw.is_active === true,
  };
}

/**
 * P1-D B2 — HOME batch load.
 * Scope: candidate storeIds only (no unbounded table scan).
 * Query failure => status=error + empty map (HOME must survive).
 */
export async function loadActiveStoreDiscoveryCampaignsForHome(
  sb: SupabaseClient,
  candidateStoreIds: readonly string[],
  opts?: { nowMs?: number }
): Promise<StoreDiscoveryCampaignHomeLoadResult> {
  const ids = [
    ...new Set(candidateStoreIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (ids.length === 0) {
    return { status: "ok", byStoreId: new Map() };
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  try {
    const { data, error } = await sb
      .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
      .select("id, store_id, campaign_type, title, body_copy, start_at, end_at, is_active")
      .in("store_id", ids)
      .eq("is_active", true)
      .lte("start_at", nowIso)
      .gt("end_at", nowIso);

    if (error) {
      console.error("[loadActiveStoreDiscoveryCampaignsForHome]", error.message);
      return { status: "error", byStoreId: new Map() };
    }

    const parsed: StoreDiscoveryCampaignAuthorityRow[] = [];
    for (const raw of data ?? []) {
      const row = parseDbRow(raw as DbRow);
      if (row) parsed.push(row);
    }

    return {
      status: "ok",
      byStoreId: selectActiveStoreDiscoveryCampaignsForHome(parsed, ids, nowMs),
    };
  } catch (e) {
    console.error("[loadActiveStoreDiscoveryCampaignsForHome]", e);
    return { status: "error", byStoreId: new Map() };
  }
}
