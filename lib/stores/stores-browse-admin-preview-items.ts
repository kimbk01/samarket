/**
 * 5-B CP-11 — 관리자 업종 목록 미리보기 = 고객 앱(`StoresBrowsePrimaryView`)과 같은 응답 해석.
 *
 * - 삽입 행(`meta.browseInsertion.rows`)이 있으면 그 순서대로 (organic · paid_ad · coupon), 없으면 매장 순서.
 * - 쿠폰 배지 = `couponBadgeByStoreId` 에 있는 매장만 (일괄 표시 금지).
 * - 탐색 선반 = 앱과 같은 `insertDiscoveryShelfIntoMixedItems`.
 * - 광고 노출 집계 없음(telemetry-free): 노출 토큰을 버린다 — 미리보기 렌더는 비콘·노출 관찰을 붙이지 않는다.
 */

import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import type { StoresBrowseInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import {
  insertDiscoveryShelfIntoMixedItems,
  type BrowseDiscoveryShelfMixedToken,
  type StoresBrowseDiscoveryShelfPayload,
} from "@/lib/stores/stores-browse-discovery-shelf";
import { browseShowsGenericCouponBadge } from "@/lib/stores/store-coupon-detail-ux";

export type AdminBrowsePreviewItem =
  | { key: string; kind: "organic"; store: BrowseStoreListItem; couponBadge: boolean }
  | {
      key: string;
      kind: "paid_ad";
      store: BrowseStoreListItem;
      promoLine: string;
    }
  | {
      key: string;
      kind: "coupon";
      store: BrowseStoreListItem;
      row: Extract<StoresBrowseInsertionMetaRow, { kind: "coupon" }>;
    };

export function buildAdminBrowsePreviewItems(input: {
  stores: readonly BrowseStoreListItem[];
  insertionRows: readonly StoresBrowseInsertionMetaRow[] | null;
  couponBadgeByStoreId: Record<string, unknown> | null;
  discoveryShelf: StoresBrowseDiscoveryShelfPayload | null;
}): BrowseDiscoveryShelfMixedToken<AdminBrowsePreviewItem>[] {
  const storeById = new Map(input.stores.map((s) => [s.id, s]));
  const organic = (store: BrowseStoreListItem): AdminBrowsePreviewItem => ({
    key: store.id,
    kind: "organic",
    store,
    couponBadge: browseShowsGenericCouponBadge(input.couponBadgeByStoreId, store.id),
  });
  const base: AdminBrowsePreviewItem[] = [];
  if (!input.insertionRows?.length) {
    for (const store of input.stores) base.push(organic(store));
  } else {
    for (const row of input.insertionRows) {
      const store = storeById.get(row.storeId);
      if (!store) continue;
      if (row.kind === "organic") {
        base.push(organic(store));
      } else if (row.kind === "paid_ad") {
        base.push({
          key: `ad-${row.campaignId}`,
          kind: "paid_ad",
          store,
          promoLine: row.headline.trim() || row.title.trim(),
        });
      } else {
        base.push({ key: `coupon-${row.campaignId}`, kind: "coupon", store, row });
      }
    }
  }
  return insertDiscoveryShelfIntoMixedItems(base, input.discoveryShelf);
}
