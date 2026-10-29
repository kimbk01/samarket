/**
 * 5-B HS-01·HS-03·HS-04·HS-08 — HOME 선반 관리자 편집 계약 (화면·저장 API·테스트 공용, 클라이언트 안전).
 *
 * - 탭당 필드 1회: 같은 필드를 두 탭에 다시 그리지 않는다 (`HOME_SHELF_ADMIN_TAB_FIELDS`).
 * - 광고 연동은 「더 많은 매장」(slot6RestStores) 만 앱에 적용된다 — 일반 선반은 저장 시 `off` 로 정규화.
 * - 「더 많은 매장」 유료 삽입 on/off 기준은 이 선반의 `ad_integration` 하나 (레거시 `homePaidAdInsertion` 은 저장 시 동기화).
 * - 이미지 옵션 「캠페인 이미지」「브랜드 로고」는 다른 옵션과 결과가 같아 선택지에서 뺀다
 *   (기존 저장값은 `stores-home-shelf-image-resolve` 가 지금과 같은 결과로 계속 처리).
 */

import type { StoresHomeDataSourceId } from "@/lib/stores/product/stores-home-data-source";
import type { StoresHomeShelfAdIntegration } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";
import { NEW_STORE_WINDOW_DAYS } from "@/lib/stores/store-new-store-signal";

export type HomeShelfAdminTab = "basic" | "data" | "presentation" | "exposure" | "coupon_ad" | "advanced";

export const HOME_SHELF_ADMIN_TABS: readonly { id: HomeShelfAdminTab; labelKo: string; labelEn: string }[] = [
  { id: "basic", labelKo: "기본", labelEn: "Basic" },
  { id: "data", labelKo: "데이터", labelEn: "Data" },
  { id: "presentation", labelKo: "표현", labelEn: "Display" },
  { id: "exposure", labelKo: "노출", labelEn: "Exposure" },
  { id: "coupon_ad", labelKo: "쿠폰·광고", labelEn: "Coupon · Ad" },
  { id: "advanced", labelKo: "고급", labelEn: "Advanced" },
];

export type HomeShelfAdminFieldKey =
  | "titleKo"
  | "titleEn"
  | "subtitleKo"
  | "subtitleEn"
  | "enabled"
  | "dataSource"
  | "popularityWindowDays"
  | "max"
  | "candidates"
  | "presentation"
  | "imageSource"
  | "order"
  | "schedule"
  | "showAll"
  | "couponIntegration"
  | "adIntegration"
  | "operatorMemo";

/** HS-01 — 탭 → 그 탭에서만 그리는 필드. 화면은 `data-home-shelf-field` 로 같은 키를 단다 (렌더 테스트가 1회 검사). */
export const HOME_SHELF_ADMIN_TAB_FIELDS: Readonly<Record<HomeShelfAdminTab, readonly HomeShelfAdminFieldKey[]>> = {
  basic: ["titleKo", "titleEn", "subtitleKo", "subtitleEn", "enabled"],
  data: ["dataSource", "popularityWindowDays", "max", "candidates"],
  presentation: ["presentation", "imageSource"],
  exposure: ["order", "schedule", "showAll"],
  coupon_ad: ["couponIntegration", "adIntegration"],
  advanced: ["operatorMemo"],
};

/** HS-04 — 관리자 선택지 (캠페인 이미지·브랜드 로고 제외). */
export const HOME_SHELF_ADMIN_IMAGE_OPTIONS: readonly StoresHomeShelfImageSource[] = [
  "auto",
  "store_profile",
  "representative_product",
];

/**
 * HS-04 — 기존 저장값을 앱 결과가 같은 선택지로 표시한다 (저장값 자체는 운영자가 바꿀 때만 바뀜).
 * brand_logo = 매장 프로필 우선 (로고 컬럼 없음) · campaign_creative = 대표 메뉴 우선 (선반 광고 소재 없음).
 */
export function homeShelfAdminImageDisplayValue(value: StoresHomeShelfImageSource): StoresHomeShelfImageSource {
  if (value === "brand_logo") return "store_profile";
  if (value === "campaign_creative") return "representative_product";
  return value;
}

export const HOME_REST_SHELF_COMPOSER_SLOT = "slot6RestStores" as const;

export function isHomeRestShelf(input: { shelfId?: string | null; composerSlot?: string | null }): boolean {
  return input.composerSlot === HOME_REST_SHELF_COMPOSER_SLOT || input.shelfId === "rest_stores";
}

function parseAdIntegration(raw: unknown): StoresHomeShelfAdIntegration {
  const v = String(raw ?? "off").trim();
  return v === "sponsored_badge" || v === "benefit_line" || v === "both" ? v : "off";
}

/**
 * HS-03·HS-09 — 저장 정규화: 일반 선반은 광고 공급 경로가 없어 항상 `off`.
 * 「더 많은 매장」은 켜기/끄기 2개 — 켜기는 기존 표시 방식(뱃지·문구)을 유지하고, 없으면 스폰서 뱃지.
 */
export function normalizeHomeShelfAdIntegrationForSave(input: {
  shelfId?: string | null;
  composerSlot?: string | null;
  adIntegration: unknown;
}): StoresHomeShelfAdIntegration {
  if (!isHomeRestShelf(input)) return "off";
  return parseAdIntegration(input.adIntegration);
}

export function isHomeRestPaidInsertionOn(adIntegration: unknown): boolean {
  return parseAdIntegration(adIntegration) !== "off";
}

/** 「더 많은 매장」 광고 켜기/끄기 → 저장값. */
export function homeRestAdIntegrationFromToggle(
  on: boolean,
  current: unknown
): StoresHomeShelfAdIntegration {
  if (!on) return "off";
  const cur = parseAdIntegration(current);
  return cur === "off" ? "sponsored_badge" : cur;
}

/**
 * HS-03 — 선반 저장 배치 안에서 레거시 `homePaidAdInsertion` 레일을 「더 많은 매장」 광고 값과 같게 맞춘다
 * (같은 CAS 저장 = 같은 트랜잭션). 「더 많은 매장」 선반이 저장 대상에 없으면 그대로 둔다.
 */
export function syncHomePaidAdInsertionRail<T extends { slot: string; enabled: boolean }>(
  rows: readonly T[],
  restAdIntegration: unknown | undefined
): T[] {
  if (restAdIntegration === undefined) return [...rows];
  const on = isHomeRestPaidInsertionOn(restAdIntegration);
  return rows.map((row) => (row.slot === "homePaidAdInsertion" ? { ...row, enabled: on } : row));
}

/** HS-08 — 후보 0 일 때 데이터 원인 안내 (코드 결함이 아니라 운영 데이터가 없는 경우). */
export function homeShelfEmptyCandidateReason(source: StoresHomeDataSourceId, ko: boolean): string {
  switch (source) {
    case "order_now":
      return ko
        ? "지금 영업 중이면서 배달 가능한 매장이 0곳입니다."
        : "No store is open with delivery available right now.";
    case "popular_menu":
      return ko
        ? "선택한 인기 기간 안에 완료된 주문이 있는 매장이 0곳입니다."
        : "No store has completed orders within the selected popularity window.";
    case "new_store":
      return ko
        ? `입점 ${NEW_STORE_WINDOW_DAYS}일 이내 신규 매장이 0곳입니다.`
        : `No store was listed within the last ${NEW_STORE_WINDOW_DAYS} days.`;
    case "editorial_promo":
      return ko
        ? "기획 프로모션에 연결된 매장이 0곳입니다. 「기획 프로모션」에서 매장을 연결하세요."
        : "No store is linked to an editorial promotion. Link stores under Editorial promotions.";
    case "delivery_fee_benefit":
      return ko
        ? "배달비 할인(정가 대비 할인된 배달비)을 설정한 매장이 0곳입니다."
        : "No store has a discounted delivery fee configured.";
    case "high_rating":
      return ko
        ? "평점 4.0 이상 · 리뷰 3개 이상인 매장이 0곳입니다."
        : "No store has rating ≥ 4.0 with at least 3 reviews.";
    case "recommended":
      return ko
        ? "추천 매장으로 지정된 매장이 0곳입니다."
        : "No store is designated as a recommended store.";
    case "rest_stores":
      return ko ? "노출 가능한 매장이 0곳입니다." : "No store is available to show.";
  }
}
