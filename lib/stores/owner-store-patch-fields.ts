/**
 * RC-4 (3-B) — 매장 PATCH 필드별 검증·정규화 (오너 `PATCH /api/me/stores/[id]` · 관리자 `set_business_hours` 공용).
 * 순수 함수 — 서버·테스트 공용, DB 접근 없음.
 */
import { sanitizeBusinessHoursJsonForPersistence } from "@/lib/stores/serialize-store-business-hours-json";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";

export type StorePatchFieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * OPS-09 — `stores.business_hours_json` 은 `NOT NULL DEFAULT '{}'`.
 * null(초기화) → `{}`, 객체 → 공개 계약 정규화, 그 외 → invalid_business_hours_json.
 */
export function normalizeStoreBusinessHoursJsonForWrite(
  raw: unknown
): StorePatchFieldResult<Record<string, unknown>> {
  if (raw === null) return { ok: true, value: {} };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: sanitizeBusinessHoursJsonForPersistence(raw) };
  }
  return { ok: false, error: "invalid_business_hours_json" };
}

/** OPS-09 — `stores.gallery_images_json` 은 `NOT NULL DEFAULT '[]'`. null → `[]`. */
export function normalizeStoreGalleryImagesJsonForWrite(raw: unknown): StorePatchFieldResult<unknown[]> {
  if (raw === null) return { ok: true, value: [] };
  if (Array.isArray(raw)) return { ok: true, value: raw };
  return { ok: false, error: "invalid_gallery_images_json" };
}

export const STORE_GCASH_NUMBER_INVALID_ERROR = "invalid_store_gcash_number";

/**
 * OPS-05 — `stores.email` 은 이 제품에서 **GCash 휴대폰 번호** 칸이다 (오너 기본정보 「GCash no.」,
 * 관리자 `admin_biz_email_field_note`: PH 모바일 normalizePhMobileDb 저장).
 * 결함은 형식이 틀린 값이 오류 없이 null 로 덮어써져 기존 값이 사라지는 것 → 빈 값만 null, 그 외 형식 오류는 400.
 */
export function normalizeStoreGcashNumberForWrite(raw: unknown): StorePatchFieldResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const t = String(raw).trim();
  if (!t) return { ok: true, value: null };
  const norm = normalizePhMobileDb(t);
  if (!norm) return { ok: false, error: STORE_GCASH_NUMBER_INVALID_ERROR };
  return { ok: true, value: norm };
}

export const STORE_NOT_APPROVED_FOR_VISIBILITY_ERROR = "store_not_approved_for_visibility";

/** OPS-07 — 노출(is_visible) 변경은 승인 매장만 (관리자 `set_store_visible` 과 같은 오류 코드). */
export function ownerStoreVisibilityChangeAllowed(approvalStatus: string | null | undefined): boolean {
  return String(approvalStatus ?? "").trim() === "approved";
}

export const STORE_CHANGED_CONFLICT_ERROR = "store_changed";

/**
 * OPS-09 — lost update 방지 CAS 토큰. 미전송(undefined)·빈 값은 null(현행처럼 무조건 저장, 점진 적용).
 * 형식이 틀리면 invalid_expected_updated_at.
 */
export function parseStoreExpectedUpdatedAt(raw: unknown): StorePatchFieldResult<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "invalid_expected_updated_at" };
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!Number.isFinite(Date.parse(t))) return { ok: false, error: "invalid_expected_updated_at" };
  return { ok: true, value: t };
}
