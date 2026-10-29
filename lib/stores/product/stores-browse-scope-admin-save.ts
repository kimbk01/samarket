/**
 * 5-B CP-04·CP-05·CP-09·CP-10 — 업종 목록 노출 정책 관리자 저장 형식 (화면·테스트 공용, 클라이언트 안전).
 *
 * - 2차 별도 설정은 **값이 있는 필드만** 저장하고 나머지는 null/"inherit"(1차 상속).
 *   · 토글(네이티브 광고·쿠폰 배지·상단 배너)은 이번 편집에서 바꿨거나 기존 행에 값이 있던 경우만 값.
 *   · 최대·간격 빈칸 = null (8 같은 기본값을 채우지 않는다).
 *   · 표시명은 2차 이름과 같거나 비면 null (고객 칩은 2차 이름).
 * - 값이 하나도 없는 별도 설정(활성 + 전부 상속) = 행 삭제 (정식 상속 = 행 없음).
 * - product_config 는 화면이 모르는 키를 보존하도록 기존 값에 병합한다.
 */

import {
  isBrowseScopeSubOverrideRow,
  type StoresBrowseScopePolicyResolved,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";

export const BROWSE_BANNER_CAPACITY_MAX = 3;

export type BrowseSubAdminToggleField = "adEnabled" | "couponEnabled" | "bannerAds";

export type BrowseSubAdminDraft = {
  mode: "inherit" | "override";
  enabled: boolean;
  draftTitleKo: string;
  draftTitleEn: string;
  adEnabled: boolean;
  couponEnabled: boolean;
  bannerAdsEnabled: boolean;
  bannerAdsCapacity: string;
  /** 빈칸 = 1차 상속 */
  draftMax: string;
  /** 빈칸 = 1차 상속 */
  draftInterval: string;
  /** 값으로 저장할 토글 (이번 편집에서 바꿨거나 기존 행에 값이 있던 것) */
  explicit: Partial<Record<BrowseSubAdminToggleField, true>>;
};

export type BrowseScopeAdminWriteRow = {
  scopeKey: string;
  primarySlug: string;
  subSlug: string | null;
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: "inherit" | "true" | "false";
  couponEnabled: "inherit" | "true" | "false";
  maxInsertion: number | null;
  intervalEveryN: number | null;
  presentationMode: "inherit" | "card_benefit_integrated";
  scheduleStart: string | null;
  scheduleEnd: string | null;
  productConfig?: Record<string, unknown>;
};

function hasBannerAdsKey(cfg: Record<string, unknown> | null | undefined): boolean {
  return Boolean(cfg && typeof cfg === "object" && !Array.isArray(cfg) && "bannerAds" in cfg);
}

/** 빈칸·0 이하·숫자 아님 = null. */
export function positiveIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** 빈칸 = null, 0 허용 (최대 삽입 수). */
export function nonNegativeIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** CP-09 — 배너 용량 입력은 1~3 (저장 때 자르지 않고 입력에서 막는다). 빈칸은 편집 중 허용. */
export function clampBrowseBannerCapacityInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = Math.trunc(Number(trimmed));
  if (!Number.isFinite(n)) return "1";
  return String(Math.max(1, Math.min(BROWSE_BANNER_CAPACITY_MAX, n)));
}

export function browseBannerCapacityForSave(value: string): number {
  return Math.max(1, Math.min(BROWSE_BANNER_CAPACITY_MAX, Math.trunc(Number(value) || 1)));
}

/** CP-10 — 기존 product_config 에 화면이 다루는 키만 덮어쓴다 (`undefined` 값 = 키 제거). */
export function mergeBrowseProductConfig(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

/** CP-04·CP-05 — 2차 편집 초안. `row` = 2차 저장 행 (별도 설정이 아니면 null). */
export function browseSubAdminDraftFrom(input: {
  nameKo: string;
  nameEn: string;
  row: StoresBrowseScopePolicyRow | null;
  resolved: StoresBrowseScopePolicyResolved;
}): BrowseSubAdminDraft {
  const row = input.row;
  const explicit: BrowseSubAdminDraft["explicit"] = {};
  if (row && row.adEnabled !== "inherit") explicit.adEnabled = true;
  if (row && row.couponEnabled !== "inherit") explicit.couponEnabled = true;
  if (row && hasBannerAdsKey(row.productConfig)) explicit.bannerAds = true;
  const max = row && row.maxInsertion !== "inherit" ? row.maxInsertion : null;
  const interval = row && row.intervalEveryN !== "inherit" ? row.intervalEveryN : null;
  return {
    mode: row ? "override" : "inherit",
    enabled: row?.enabled ?? true,
    /** CP-05 — 초기값 = 2차 저장 표시명, 없으면 2차 이름 (1차 표시명을 끌어오지 않는다). */
    draftTitleKo: row?.displayTitleKo?.trim() || input.nameKo,
    draftTitleEn: row?.displayTitleEn?.trim() || input.nameEn,
    adEnabled: input.resolved.adEnabled,
    couponEnabled: input.resolved.couponEnabled,
    bannerAdsEnabled: input.resolved.bannerAds.enabled,
    bannerAdsCapacity: String(input.resolved.bannerAds.capacity),
    draftMax: max == null ? "" : String(max),
    draftInterval: interval == null ? "" : String(interval),
    explicit,
  };
}

function ownTitle(draft: string, name: string): string | null {
  const t = draft.trim();
  if (!t || t === name.trim()) return null;
  return t;
}

/**
 * CP-04 — 2차 저장 행. 상속(또는 값 없는 별도 설정) = `delete`.
 */
export function buildBrowseSubAdminWrite(input: {
  scopeKey: string;
  primarySlug: string;
  subSlug: string;
  nameKo: string;
  nameEn: string;
  existingProductConfig: Record<string, unknown> | null | undefined;
  draft: BrowseSubAdminDraft;
}): { kind: "delete" } | { kind: "upsert"; row: BrowseScopeAdminWriteRow } {
  const { draft } = input;
  if (draft.mode === "inherit") return { kind: "delete" };
  const productConfig = mergeBrowseProductConfig(input.existingProductConfig, {
    bannerAds: draft.explicit.bannerAds
      ? {
          enabled: draft.bannerAdsEnabled,
          position: "top_context",
          capacity: browseBannerCapacityForSave(draft.bannerAdsCapacity),
        }
      : undefined,
  });
  const row: BrowseScopeAdminWriteRow = {
    scopeKey: input.scopeKey,
    primarySlug: input.primarySlug,
    subSlug: input.subSlug,
    enabled: draft.enabled,
    displayTitleKo: ownTitle(draft.draftTitleKo, input.nameKo),
    displayTitleEn: ownTitle(draft.draftTitleEn, input.nameEn),
    adEnabled: draft.explicit.adEnabled ? (draft.adEnabled ? "true" : "false") : "inherit",
    couponEnabled: draft.explicit.couponEnabled ? (draft.couponEnabled ? "true" : "false") : "inherit",
    maxInsertion: nonNegativeIntOrNull(draft.draftMax),
    intervalEveryN: positiveIntOrNull(draft.draftInterval),
    presentationMode: "inherit",
    scheduleStart: null,
    scheduleEnd: null,
    productConfig,
  };
  const asPolicyRow: StoresBrowseScopePolicyRow = {
    ...row,
    adEnabled: row.adEnabled === "inherit" ? "inherit" : row.adEnabled === "true",
    couponEnabled: row.couponEnabled === "inherit" ? "inherit" : row.couponEnabled === "true",
  };
  if (!isBrowseScopeSubOverrideRow(asPolicyRow)) return { kind: "delete" };
  return { kind: "upsert", row };
}
