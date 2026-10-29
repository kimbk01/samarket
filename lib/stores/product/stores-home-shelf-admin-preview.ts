/**
 * H-11·H-12 — 어드민 HOME 선반 미리보기·목록 집계 = 앱과 같은 계산.
 *
 * 어드민 초안(켜기·순서·최대·기간·소스·표현·이미지·혜택)을 선반 설정 전체에 덮어쓴 뒤
 * 앱과 같은 `composeLiveHomeFeed` 로 조합한다. 화면 렌더는 앱의 `StoresHomeCompositionSlotSection` 이 담당.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  composeLiveHomeFeed,
  type StoresHomeCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

export type AdminHomeShelfDraftPreview = {
  shelves: StoresHomeShelfResolvedConfig[];
  policyMeta: StoresHomeCompositionPolicyMeta | null;
  composition: StoresHomeFeedComposition;
};

/** 초안 값으로 고객 노출 여부 재계산 — 앱 `mergeShelf` 와 같은 조건 (사용 가능 + 켜짐 + 슬롯 + 기간 안). */
export function applyHomeShelfDraftVisibility(
  shelf: StoresHomeShelfResolvedConfig,
  nowMs: number = Date.now()
): StoresHomeShelfResolvedConfig {
  return {
    ...shelf,
    customerVisible:
      shelf.availability !== "unavailable" &&
      shelf.enabled &&
      shelf.composerSlot != null &&
      isWithinProductScheduleWindow(shelf.scheduleStart, shelf.scheduleEnd, nowMs),
  };
}

function applyDraftToPolicyRows(
  rows: readonly StoresCompositionSectionContract[],
  shelves: readonly StoresHomeShelfResolvedConfig[]
): StoresCompositionSectionContract[] {
  return rows.map((row) => {
    const shelf = shelves.find((s) => s.composerSlot === row.slot);
    if (!shelf) return row;
    return { ...row, enabled: shelf.enabled, order: shelf.order, max: shelf.max };
  });
}

export function buildAdminHomeShelfDraftPreview(input: {
  draftShelves: readonly StoresHomeShelfResolvedConfig[];
  stores: readonly StoreHomeFeedItem[];
  policyMeta: StoresHomeCompositionPolicyMeta | null;
  nowMs?: number;
}): AdminHomeShelfDraftPreview {
  const shelves = input.draftShelves.map((s) => applyHomeShelfDraftVisibility(s, input.nowMs));
  const policyMeta = input.policyMeta?.rows?.length
    ? { ...input.policyMeta, rows: applyDraftToPolicyRows(input.policyMeta.rows, shelves) }
    : input.policyMeta;
  const composition = composeLiveHomeFeed(input.stores, policyMeta, shelves);
  return { shelves, policyMeta, composition };
}

/** 앱에 실제로 그려질 항목 수 (선반 최대 개수 적용 후). */
export function countAdminHomeShelfRenderedItems(
  composition: StoresHomeFeedComposition,
  shelf: Pick<StoresHomeShelfResolvedConfig, "composerSlot" | "max">
): number {
  const slot: StoresHomeCompositionSlotKey | null = shelf.composerSlot;
  if (!slot) return 0;
  const items = composition[slot];
  const n = Array.isArray(items) ? items.length : 0;
  return shelf.max != null ? Math.min(n, Math.max(0, shelf.max)) : n;
}

/**
 * 어드민 미리보기는 광고 노출·클릭 집계를 만들지 않는다 (P0-A/P0-C 계약: telemetry-free).
 * 노출 토큰이 실린 유료 삽입 행을 빼고, 토큰 없는 쿠폰·광고 혜택 문구용 데이터만 남긴다.
 */
export function toTelemetryFreeHomeInsertions(
  meta: StoresHomeInsertionMeta | undefined
): StoresHomeInsertionMeta | undefined {
  if (!meta) return undefined;
  return {
    ...meta,
    restInsertion: {
      ...meta.restInsertion,
      rows: meta.restInsertion.rows.filter((row) => row.kind === "organic"),
      adCount: 0,
      sponsoredStoreIds: [],
    },
  };
}
