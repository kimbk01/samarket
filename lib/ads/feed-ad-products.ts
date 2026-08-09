/**
 * Feed banner D-Point product SSOT — DB AUTHORITY (`feed_ad_products`).
 *
 * Runtime Member catalog / create HOLD / renewal MUST read via Supabase
 * `feed_ad_products`. Admin PATCH is the sole price/period writer.
 *
 * Request rows snapshot `duration_days` + `point_cost` at create/renew —
 * Admin catalog edits do NOT rewrite past requests.
 *
 * `FEED_AD_PRODUCT_DEPLOY_SEED` is deploy/migration reference only — NOT a
 * second runtime price authority.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedAdDomain } from "@/lib/ads/feed-ad-placement";

export type FeedAdProduct = {
  id: string;
  domain: FeedAdDomain;
  durationDays: number;
  pointCost: number;
  titleKo: string;
  titleEn: string;
  sortOrder: number;
  active: boolean;
};

/** Deploy seed reference (migration 20261024120000) — tests / docs only. */
export const FEED_AD_PRODUCT_DEPLOY_SEED = [
  { id: "feed_banner_trade_3", domain: "trade" as const, durationDays: 3, pointCost: 8000 },
  { id: "feed_banner_trade_7", domain: "trade" as const, durationDays: 7, pointCost: 15000 },
  { id: "feed_banner_community_3", domain: "community" as const, durationDays: 3, pointCost: 10000 },
  { id: "feed_banner_community_7", domain: "community" as const, durationDays: 7, pointCost: 20000 },
] as const;

export function mapFeedAdProductRow(row: Record<string, unknown>): FeedAdProduct | null {
  const id = String(row.id ?? "").trim();
  const domain = String(row.domain ?? "").trim();
  if (!id || (domain !== "trade" && domain !== "community")) return null;
  const durationDays = Number(row.duration_days);
  const pointCost = Number(row.point_cost);
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) return null;
  if (!Number.isFinite(pointCost) || pointCost < 1) return null;
  return {
    id,
    domain,
    durationDays: Math.floor(durationDays),
    pointCost: Math.floor(pointCost),
    titleKo: String(row.title_ko ?? "").trim() || id,
    titleEn: String(row.title_en ?? "").trim() || id,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Math.floor(Number(row.sort_order)) : 0,
    active: row.is_active !== false,
  };
}

export async function listFeedAdProducts(
  sb: SupabaseClient,
  opts?: { domain?: FeedAdDomain; activeOnly?: boolean }
): Promise<FeedAdProduct[]> {
  let q = sb.from("feed_ad_products").select("*").order("sort_order", { ascending: true });
  if (opts?.domain) q = q.eq("domain", opts.domain);
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.warn("[feed-ad-products] list", error.message);
    return [];
  }
  return (data ?? [])
    .map((r) => mapFeedAdProductRow(r as Record<string, unknown>))
    .filter((p): p is FeedAdProduct => p != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Member/renew — active products only. */
export async function listActiveFeedAdProducts(
  sb: SupabaseClient,
  domain?: FeedAdDomain
): Promise<FeedAdProduct[]> {
  return listFeedAdProducts(sb, { domain, activeOnly: true });
}

/** Purchase path — active product by id. */
export async function getFeedAdProduct(
  sb: SupabaseClient,
  id: string
): Promise<FeedAdProduct | null> {
  const key = id.trim();
  if (!key) return null;
  const { data, error } = await sb.from("feed_ad_products").select("*").eq("id", key).maybeSingle();
  if (error || !data) return null;
  const mapped = mapFeedAdProductRow(data as Record<string, unknown>);
  if (!mapped || !mapped.active) return null;
  return mapped;
}

export type FeedAdProductPatch = {
  durationDays?: number;
  pointCost?: number;
  titleKo?: string;
  titleEn?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function updateFeedAdProduct(
  sb: SupabaseClient,
  id: string,
  patch: FeedAdProductPatch
): Promise<{ ok: true; product: FeedAdProduct } | { ok: false; error: string }> {
  const key = id.trim();
  if (!key) return { ok: false, error: "missing_id" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.durationDays != null) {
    const d = Math.floor(Number(patch.durationDays));
    if (!Number.isFinite(d) || d < 1 || d > 90) return { ok: false, error: "invalid_duration" };
    update.duration_days = d;
  }
  if (patch.pointCost != null) {
    const p = Math.floor(Number(patch.pointCost));
    if (!Number.isFinite(p) || p < 1) return { ok: false, error: "invalid_point_cost" };
    update.point_cost = p;
  }
  if (patch.titleKo != null) update.title_ko = String(patch.titleKo).trim();
  if (patch.titleEn != null) update.title_en = String(patch.titleEn).trim();
  if (patch.isActive != null) update.is_active = Boolean(patch.isActive);
  if (patch.sortOrder != null) {
    const s = Math.floor(Number(patch.sortOrder));
    if (!Number.isFinite(s)) return { ok: false, error: "invalid_sort_order" };
    update.sort_order = s;
  }

  const { data, error } = await sb
    .from("feed_ad_products")
    .update(update)
    .eq("id", key)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };
  const product = mapFeedAdProductRow(data as Record<string, unknown>);
  if (!product) return { ok: false, error: "invalid_row" };
  return { ok: true, product };
}
