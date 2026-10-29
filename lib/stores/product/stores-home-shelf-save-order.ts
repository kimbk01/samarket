/**
 * H-03 — HOME 선반 저장 시 구성 순서 정규화 (서버 단일 책임).
 *
 * 어드민은 선반만 드래그한다. 같은 surface 의 비선반 슬롯(배너·유료/쿠폰 삽입·사용 불가 선반)은
 * 함께 저장돼야 하므로, 선반 순서를 0..n-1 로 매기고 비선반 슬롯은 기존 상대 순서로 그 뒤에 붙인다.
 * → `validateCompositionPolicyBatch` 의 duplicate_order 가 드래그 결과로 발생하지 않는다.
 */

import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import {
  STORES_HOME_SHELF_PRODUCT_CATALOG,
  shelfIdToComposerSlot,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";

export type HomeShelfSaveInput = {
  shelfId: string;
  enabled: boolean;
  order: number;
  max: number | null;
};

export type HomeCompositionCurrentRow = {
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
};

export type HomeCompositionSaveRow = {
  surface: "home";
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: { consumed: false; reason: "NOT_CONSUMED" };
};

const INTERVAL = { consumed: false as const, reason: "NOT_CONSUMED" as const };

function catalogIndex(shelfId: string): number {
  const i = STORES_HOME_SHELF_PRODUCT_CATALOG.findIndex((s) => s.shelfId === shelfId);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function normalizeHomeShelfSaveOrder(
  shelves: readonly HomeShelfSaveInput[],
  currentRows: readonly HomeCompositionCurrentRow[]
): HomeCompositionSaveRow[] {
  const shelfRows = shelves
    .map((shelf) => ({ shelf, slot: shelfIdToComposerSlot(shelf.shelfId) }))
    .filter((x): x is { shelf: HomeShelfSaveInput; slot: NonNullable<typeof x.slot> } => x.slot != null)
    .sort(
      (a, b) =>
        (Number.isFinite(a.shelf.order) ? a.shelf.order : 0) - (Number.isFinite(b.shelf.order) ? b.shelf.order : 0) ||
        catalogIndex(a.shelf.shelfId) - catalogIndex(b.shelf.shelfId)
    );

  const shelfSlots = new Set<string>(shelfRows.map((x) => x.slot));
  const out: HomeCompositionSaveRow[] = shelfRows.map(({ shelf, slot }, index) => {
    const defaultRow = STORES_HOME_COMPOSITION_DEFAULT_POLICY.find((r) => r.slot === slot);
    return {
      surface: "home",
      slot,
      contentType: defaultRow?.contentType ?? "food_product",
      enabled: shelf.enabled,
      order: index,
      max: shelf.max,
      interval: INTERVAL,
    };
  });

  const preserved = currentRows
    .filter((r) => !shelfSlots.has(r.slot))
    .sort((a, b) => a.order - b.order);
  preserved.forEach((r, i) => {
    out.push({
      surface: "home",
      slot: r.slot,
      contentType: r.contentType,
      enabled: r.enabled,
      order: shelfRows.length + i,
      max: r.max,
      interval: INTERVAL,
    });
  });
  return out;
}
