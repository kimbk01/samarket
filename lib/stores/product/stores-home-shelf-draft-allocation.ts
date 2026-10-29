/**
 * HA-1 · HA-7 — 관리자 홈 화면 구성의 「후보 · 배정 · 숨김 사유」와 실데이터 미리보기를
 * 고객 홈과 같은 계산(`composeLiveHomeFeed`)으로 만든다. 순수 함수 — 관리자 화면·테스트 공용.
 */
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  composeLiveHomeFeed,
  type StoresHomeCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomeShelfProductConfig } from "@/lib/stores/product/stores-home-shelf-product-config";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import {
  coerceDataSourceForSlot,
  coercePresentationForDataSource,
  countHomeDataSourceCandidates,
  defaultDataSourceForSlot,
  diagnoseHomeShelfCustomerHidden,
  type HomeShelfHiddenReason,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";
import { resolvePopularityWindowDays } from "@/lib/stores/store-discovery-popular-store";

/** 관리자 초안 한 줄 — 저장 전 값 */
export type HomeShelfDraftInput = {
  shelfId: string;
  enabled: boolean;
  order: number;
  max: number | null;
  presentation: StoresHomePresentationPatternId;
  dataSource: StoresHomeDataSourceId;
  productConfig: StoresHomeShelfProductConfig;
  scheduleStart: string | null;
  scheduleEnd: string | null;
};

/** 저장된 선반 설정 위에 초안을 덮어 고객 해석(`mergeShelf`)과 같은 규칙으로 다시 계산 */
export function applyHomeShelfDrafts(
  saved: readonly StoresHomeShelfResolvedConfig[],
  drafts: readonly HomeShelfDraftInput[],
  nowMs: number = Date.now()
): StoresHomeShelfResolvedConfig[] {
  const byId = new Map(drafts.map((d) => [d.shelfId, d]));
  return saved.map((row) => {
    const d = byId.get(row.shelfId);
    if (!d) return row;
    const unavailable = row.availability === "unavailable";
    const enabled = unavailable ? false : d.enabled;
    const dataSource = coerceDataSourceForSlot(row.composerSlot, d.dataSource ?? defaultDataSourceForSlot(row.composerSlot));
    return {
      ...row,
      enabled,
      order: d.order,
      max: d.max,
      dataSource,
      presentation: coercePresentationForDataSource(dataSource, d.presentation),
      productConfig: { ...row.productConfig, ...d.productConfig, dataSource },
      scheduleStart: d.scheduleStart,
      scheduleEnd: d.scheduleEnd,
      customerVisible:
        !unavailable &&
        enabled &&
        row.composerSlot != null &&
        isWithinProductScheduleWindow(d.scheduleStart, d.scheduleEnd, nowMs),
    };
  });
}

export type HomeShelfAdminAllocation = {
  candidateCount: number;
  allocatedCount: number;
  customerVisible: boolean;
  hiddenReason: HomeShelfHiddenReason;
  /** 후보는 있는데 위 선반이 같은 매장·상품을 먼저 가져가 0 이 된 경우 */
  preemptedByUpperShelves: boolean;
  /** 같은 데이터 소스를 쓰는 다른 켜진 선반 수 (같은 매장이 반복됨) */
  sameSourceShelfCount: number;
};

/** 고객 홈과 같은 배정 결과로 선반별 상태를 만든다 */
export function allocateHomeShelvesForAdmin(
  stores: readonly StoreHomeFeedItem[],
  policyMeta: StoresHomeCompositionPolicyMeta | null | undefined,
  shelves: readonly StoresHomeShelfResolvedConfig[]
): Record<string, HomeShelfAdminAllocation> {
  const composition = stores.length > 0 ? composeLiveHomeFeed(stores, policyMeta, shelves) : null;
  const overlay = policyMeta?.popularityOverlay?.countsByDays ?? {};
  const out: Record<string, HomeShelfAdminAllocation> = {};
  for (const row of shelves) {
    const overlayRec = overlay[String(resolvePopularityWindowDays(row.productConfig.popularityWindowDays))];
    const pool =
      row.dataSource === "popular_menu" && overlayRec
        ? stores.map((s) => ({ ...s, completedOrderCount30d: overlayRec[s.id] ?? 0 }))
        : stores;
    const candidateCount = countHomeDataSourceCandidates(pool, row.dataSource);
    const items = row.composerSlot && composition ? (composition as Record<string, unknown>)[row.composerSlot] : null;
    const assigned = Array.isArray(items) ? items.length : 0;
    const allocatedCount = row.max != null ? Math.min(assigned, Math.max(0, row.max)) : assigned;
    const diag = diagnoseHomeShelfCustomerHidden({
      unavailable: row.availability === "unavailable",
      enabled: row.enabled,
      scheduleOk: !row.enabled || row.customerVisible,
      candidateCount,
      allocatedCount,
    });
    out[row.shelfId] = {
      candidateCount,
      allocatedCount,
      customerVisible: diag.customerVisible,
      hiddenReason: diag.hiddenReason,
      preemptedByUpperShelves: diag.hiddenReason === "empty_allocated",
      sameSourceShelfCount: shelves.filter(
        (s) => s.shelfId !== row.shelfId && s.enabled && s.composerSlot != null && s.dataSource === row.dataSource
      ).length,
    };
  }
  return out;
}
