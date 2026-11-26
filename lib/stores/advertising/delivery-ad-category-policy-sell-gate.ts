/**
 * Fail-closed: CATEGORY_FEED sale requires category policy adEnabled for the
 * store's taxonomy scope (primary or secondary).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { DeliveryAdBrowseTargetKind } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";

export async function assertCategoryFeedSellableByPolicy(
  sb: SupabaseClient,
  input: {
    primarySlug: string | null | undefined;
    secondarySlug?: string | null | undefined;
    browseTargetKind: DeliveryAdBrowseTargetKind;
  }
): Promise<{ ok: true } | { ok: false; error: "category_ads_disabled" | "taxonomy_required" }> {
  const primary = String(input.primarySlug ?? "")
    .trim()
    .toLowerCase();
  if (!primary) return { ok: false, error: "taxonomy_required" };
  const secondary =
    input.browseTargetKind === "secondary"
      ? String(input.secondarySlug ?? "")
          .trim()
          .toLowerCase()
      : null;
  if (input.browseTargetKind === "secondary" && !secondary) {
    return { ok: false, error: "taxonomy_required" };
  }

  const mapped = (await listBrowseScopePolicyRows(sb)).map(mapBrowseScopeDbRow);
  const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
  const resolved = resolveBrowseScopePolicy({
    primarySlug: primary,
    subSlug: secondary,
    primaryRow: byScope.get(primary) ?? null,
    subRow: secondary ? byScope.get(`${primary}/${secondary}`) ?? null : null,
  });
  if (!resolved.adEnabled) {
    return { ok: false, error: "category_ads_disabled" };
  }
  return { ok: true };
}

/**
 * 광고 요금 안내 전용 (광고 감사 R-23 · 2026-11-26) — 광고가 켜진 업종(사용 중 대분류 또는 그 소분류)이 하나라도 있는지.
 * 하나도 없으면 「매장 홍보 (업종)」 줄을 내리지 않는다(제출이 `category_ads_disabled` 로 막히는 금액을 안내하지 않음).
 * 판정 = 제출 판정(`assertCategoryFeedSellableByPolicy`)과 같은 `resolveBrowseScopePolicy`. 조회 오류는 던진다.
 */
export async function evaluateAnyCategoryFeedSellable(sb: SupabaseClient): Promise<boolean> {
  const [rows, cats] = await Promise.all([
    listBrowseScopePolicyRows(sb),
    sb.from("store_categories").select("slug").eq("is_active", true),
  ]);
  if (cats.error) throw new Error(cats.error.message || "store_categories_load_failed");
  const mapped = rows.map(mapBrowseScopeDbRow);
  const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
  const active = new Set(
    (cats.data ?? [])
      .map((r) => String((r as { slug?: unknown }).slug ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  for (const primary of active) {
    const primaryRow = byScope.get(primary) ?? null;
    if (resolveBrowseScopePolicy({ primarySlug: primary, subSlug: null, primaryRow, subRow: null }).adEnabled) {
      return true;
    }
  }
  for (const r of mapped) {
    if (!r.subSlug) continue;
    const primary = r.primarySlug.trim().toLowerCase();
    if (!active.has(primary)) continue;
    const resolved = resolveBrowseScopePolicy({
      primarySlug: primary,
      subSlug: r.subSlug,
      primaryRow: byScope.get(primary) ?? null,
      subRow: r,
    });
    if (resolved.adEnabled) return true;
  }
  return false;
}
