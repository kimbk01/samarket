/**
 * HA-1 · HA-7 — 관리자 홈 화면 구성의 「후보 · 배정 · 숨김 사유」와 실데이터 미리보기를
 * 고객 홈과 같은 계산(`composeLiveHomeFeed`)으로 만든다. 순수 함수 — 관리자 화면·테스트 공용.
 */
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  composeLiveHomeFeedWithDiagnostics,
  type StoresHomeCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomeShelfProductConfig } from "@/lib/stores/product/stores-home-shelf-product-config";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import {
  coerceDataSourceForSlot,
  coercePresentationForDataSource,
  defaultDataSourceForSlot,
  diagnoseHomeShelfCustomerHidden,
  type HomeShelfHiddenReason,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

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
  /** 후보지만 대표 메뉴가 없어 카드에서 빠진 매장 수 */
  noProductCount: number;
  allocatedCount: number;
  customerVisible: boolean;
  hiddenReason: HomeShelfHiddenReason;
  /** 같은 데이터 소스를 쓰는 켜진 선반 수 (자기 포함, 2 이상이면 같은 매장이 반복) */
  sameSourceShelfCount: number;
};

/** 고객 홈과 같은 배정(`composeLiveHomeFeedWithDiagnostics`) 1회로 선반별 상태를 만든다 — 별도 후보 계산 없음 */
export function allocateHomeShelvesForAdmin(
  stores: readonly StoreHomeFeedItem[],
  policyMeta: StoresHomeCompositionPolicyMeta | null | undefined,
  shelves: readonly StoresHomeShelfResolvedConfig[]
): Record<string, HomeShelfAdminAllocation> {
  const { composition, diagnostics } = composeLiveHomeFeedWithDiagnostics(stores, policyMeta, shelves);
  const out: Record<string, HomeShelfAdminAllocation> = {};
  for (const row of shelves) {
    const diag = row.composerSlot ? diagnostics[row.composerSlot] : undefined;
    const items = row.composerSlot ? (composition as Record<string, unknown>)[row.composerSlot] : null;
    const assigned = Array.isArray(items) ? items.length : 0;
    const allocatedCount = row.max != null ? Math.min(assigned, Math.max(0, row.max)) : assigned;
    const hidden = diagnoseHomeShelfCustomerHidden({
      unavailable: row.availability === "unavailable",
      enabled: row.enabled,
      scheduleOk: !row.enabled || row.customerVisible,
      candidateCount: diag?.candidateCount ?? 0,
      noProductCount: diag?.noProductCount ?? 0,
      max: row.max,
      allocatedCount,
    });
    out[row.shelfId] = {
      candidateCount: diag?.candidateCount ?? 0,
      noProductCount: diag?.noProductCount ?? 0,
      allocatedCount,
      customerVisible: hidden.customerVisible,
      hiddenReason: hidden.hiddenReason,
      sameSourceShelfCount: shelves.filter(
        (s) => s.enabled && s.composerSlot != null && s.dataSource === row.dataSource
      ).length,
    };
  }
  return out;
}
