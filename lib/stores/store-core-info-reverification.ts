/**
 * ND-2 (Owner 결정 2026-10-20) — 승인(approved) 매장의 핵심 위치 정보(주소·좌표) 변경은
 * 즉시 반영(영업 중단 없음)하되 관리자 재검증 대상으로 표시한다.
 * 매장명·업종·카테고리는 기존 `owner_can_edit_store_identity` 허용 플래그로만 바뀐다(이 모듈 범위 밖).
 * 영업시간·전화·토글·최소주문·배달비·소개·이미지 = 감사 기록만(재검증 없음).
 *
 * 클라이언트·서버 공용 순수 규칙 — 서버 전용 모듈을 import 하지 않는다.
 * DB: `stores.core_info_review_status` / `core_info_changed_at` / `core_info_changed_fields`
 *     (supabase/migrations/20270602140100_store_core_info_reverification_flag.sql).
 */

export const STORE_CORE_LOCATION_FIELDS = [
  "region",
  "city",
  "district",
  "address_line1",
  "address_line2",
  "lat",
  "lng",
] as const;

export type StoreCoreLocationField = (typeof STORE_CORE_LOCATION_FIELDS)[number];

export const STORE_CORE_INFO_REVIEW_NONE = "none";
export const STORE_CORE_INFO_REVIEW_PENDING = "pending_reverification";

export type StoreCoreInfoReviewStatus =
  | typeof STORE_CORE_INFO_REVIEW_NONE
  | typeof STORE_CORE_INFO_REVIEW_PENDING;

/** 좌표 비교 허용 오차 (~1m) — 같은 핀을 다시 저장한 경우를 변경으로 보지 않는다. */
const COORD_EPSILON = 0.00001;

function normText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\s+/g, " ").toLowerCase();
}

function normCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function sameValue(field: StoreCoreLocationField, before: unknown, after: unknown): boolean {
  if (field === "lat" || field === "lng") {
    const a = normCoord(before);
    const b = normCoord(after);
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) < COORD_EPSILON;
  }
  return normText(before) === normText(after);
}

/** patch 에 들어 있고 실제 값이 바뀐 핵심 위치 필드만 반환 (재저장·공백 차이는 변경 아님). */
export function changedStoreCoreLocationFields(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): StoreCoreLocationField[] {
  const out: StoreCoreLocationField[] = [];
  for (const f of STORE_CORE_LOCATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, f)) continue;
    if (!sameValue(f, current[f], patch[f])) out.push(f);
  }
  return out;
}

/** 재검증 표시는 승인 매장 + 핵심 위치 필드 실제 변경일 때만. 심사 중·보완 매장은 심사 자체가 검증한다. */
export function shouldFlagStoreCoreInfoReverification(
  approvalStatus: string | null | undefined,
  changedFields: readonly string[]
): boolean {
  return String(approvalStatus ?? "").trim() === "approved" && changedFields.length > 0;
}

export function buildStoreCoreInfoReverificationPatch(
  changedFields: readonly StoreCoreLocationField[],
  nowIso: string
): {
  core_info_review_status: typeof STORE_CORE_INFO_REVIEW_PENDING;
  core_info_changed_at: string;
  core_info_changed_fields: StoreCoreLocationField[];
} {
  return {
    core_info_review_status: STORE_CORE_INFO_REVIEW_PENDING,
    core_info_changed_at: nowIso,
    core_info_changed_fields: [...changedFields],
  };
}

export const STORE_CORE_INFO_FLAG_KEYS = [
  "core_info_review_status",
  "core_info_changed_at",
  "core_info_changed_fields",
] as const;

/** 마이그레이션 적용 전 배포 구간: 플래그 컬럼 부재 오류인지 (이때만 플래그 없이 저장 재시도). */
export function isStoreCoreInfoFlagColumnMissingError(message: string | null | undefined): boolean {
  const m = String(message ?? "");
  return /core_info_/i.test(m) && /(does not exist|schema cache|could not find)/i.test(m);
}

export function isStoreCoreInfoPendingReverification(status: unknown): boolean {
  return String(status ?? "").trim() === STORE_CORE_INFO_REVIEW_PENDING;
}
