/**
 * 관리자 변경 API 의 처리 사유 (재설계 R2) — L2·L3 동작은 화면 확인창의 사유를 본문 `reason` 으로 받아
 * 같은 최소 길이로 검증하고 감사 기록(`after.reason`)에 남긴다. 서버·클라이언트 공용 (순수 함수).
 */

/** 사유 최소 글자 수 — 화면 확인창(`confirmAdminAction`)과 서버 검증이 같은 값을 쓴다. */
export const ADMIN_REASON_MIN_LENGTH = 2;
export const ADMIN_REASON_MAX_LENGTH = 500;

/** 본문 값 → 정리된 사유. 없거나 최소 길이 미만이면 null. */
export function parseAdminReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, ADMIN_REASON_MAX_LENGTH);
  return t.length >= ADMIN_REASON_MIN_LENGTH ? t : null;
}

/** 사유 필수 동작에서 사유가 없을 때 API 가 돌려줄 오류 코드 (오류 맵: 「사유를 입력해 주세요.」). */
export const ADMIN_REASON_REQUIRED_CODE = "reason_required";
