"use client";

/**
 * 매장 상세 cold·warm 공통 — summary·banners·menus 선요청.
 * 첫 방문·재방문 체감 차이를 줄이기 위해 viewport·pointer intent 에서 동일 세트를 호출한다.
 */

import { fetchStoreBannersDeduped, fetchStoreMenusDeduped, fetchStoreSummaryDeduped } from "@/lib/stores/store-delivery-api-client";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";

const summaryStarted = new Set<string>();
const bannersStarted = new Set<string>();

function slugKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function deliveryStoreSummaryPrewarmAlways(slug: string, opts?: { force?: boolean }): void {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return;
  if (!opts?.force && summaryStarted.has(s)) return;
  summaryStarted.add(s);
  void fetchStoreSummaryDeduped(s).catch(() => {
    summaryStarted.delete(s);
  });
}

export function deliveryStoreBannersPrewarmAlways(slug: string, opts?: { force?: boolean }): void {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return;
  if (!opts?.force && bannersStarted.has(s)) return;
  bannersStarted.add(s);
  void fetchStoreBannersDeduped(s).catch(() => {
    bannersStarted.delete(s);
  });
}

/** menus + summary + banners — 탭·뷰포트 공통 */
export function deliveryStoreDetailPrewarmAll(slug: string, opts?: { force?: boolean }): void {
  deliveryStoreMenusPrewarm(slug, opts);
  deliveryStoreSummaryPrewarmAlways(slug, opts);
  deliveryStoreBannersPrewarmAlways(slug, opts);
}

export function resetDeliveryStoreDetailPrewarmForTests(): void {
  summaryStarted.clear();
  bannersStarted.clear();
}
