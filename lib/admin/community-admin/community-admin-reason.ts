/**
 * 커뮤니티 Admin 사유 규칙 — 화면(`confirmAdminAction`, 2자)과 서버가 같은 기준을 쓴다.
 * 클라이언트·서버 공용 (UI 모듈 import 금지).
 */
export const COMMUNITY_ADMIN_REASON_MIN_LENGTH = 2;
export const COMMUNITY_ADMIN_REASON_MAX_LENGTH = 1000;

export function normalizeCommunityAdminReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length < COMMUNITY_ADMIN_REASON_MIN_LENGTH) return null;
  return t.slice(0, COMMUNITY_ADMIN_REASON_MAX_LENGTH);
}

/** 영구 삭제 허용 조건 (O-2): 삭제 상태로 30일 이상 */
export const COMMUNITY_HARD_DELETE_MIN_DAYS = 30;
