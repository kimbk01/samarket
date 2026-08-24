/**
 * CATEGORY browse — resolve operator scope policy for customer meta + enable gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

export type StoresBrowseScopeCustomerMeta = {
  primarySlug: string;
  subSlug: string | null;
  /** false → customer list must be empty for this scope */
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: boolean;
  couponEnabled: boolean;
  maxInsertion: number | null;
  intervalEveryN: number;
  presentationMode: string;
  cardType: "store" | "product" | "mixed";
};

export async function resolveStoresBrowseScopeCustomerMeta(
  sb: SupabaseClient,
  primarySlug: string,
  subSlug: string | null
): Promise<StoresBrowseScopeCustomerMeta> {
  const pk = primarySlug.trim().toLowerCase();
  const skRaw = subSlug?.trim().toLowerCase() ?? null;
  const sk = skRaw && skRaw !== "all" ? skRaw : null;

  const dbRows = await listBrowseScopePolicyRows(sb);
  const mapped = dbRows.map(mapBrowseScopeDbRow);
  const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
  const primaryRow = byScope.get(pk) ?? null;
  const subRow = sk ? byScope.get(`${pk}/${sk}`) ?? null : null;
  const resolved = resolveBrowseScopePolicy({
    primarySlug: pk,
    subSlug: sk,
    primaryRow,
    subRow,
  });

  const cfg = (sk ? subRow?.productConfig : primaryRow?.productConfig) ?? primaryRow?.productConfig ?? null;
  const rawCard = cfg && typeof cfg === "object" ? (cfg as { cardType?: unknown }).cardType : null;
  const cardType: "store" | "product" | "mixed" =
    rawCard === "product" || rawCard === "mixed" || rawCard === "store" ? rawCard : "store";

  const scheduleOk = isWithinProductScheduleWindow(resolved.scheduleStart, resolved.scheduleEnd);
  const enabled =
    resolved.enabled &&
    resolved.presentationMode !== "hidden" &&
    scheduleOk;

  return {
    primarySlug: pk,
    subSlug: sk,
    enabled,
    displayTitleKo: resolved.displayTitleKo,
    displayTitleEn: resolved.displayTitleEn,
    adEnabled: resolved.adEnabled,
    couponEnabled: resolved.couponEnabled,
    maxInsertion: resolved.maxInsertion,
    intervalEveryN: resolved.intervalEveryN,
    presentationMode: resolved.presentationMode,
    cardType,
  };
}
