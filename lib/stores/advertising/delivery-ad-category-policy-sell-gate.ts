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
