/**
 * 비회원 차단 → 로그인 화면 주소의 검색어 (proxy `respondGuestBlocked` 전용).
 * 통합 공유 S5 (Owner 2026-11-14 「S5 로그인 복귀 진행」): 원래 주소를 `next` 로 넘겨 로그인 후 돌아오게 한다.
 * - 열린 리다이렉트 차단 = `sanitizeNextPath` (외부 주소·`//`·백슬래시·/api·/login 등 제외)
 * - 계정 의존 경로(채팅방·통화·주문·쓰기 등) = `sanitizeLoginNextPath` 가 제외 → `next` 없음 (기존 계약 그대로)
 */
import { sanitizeLoginNextPath } from "@/lib/auth/auth-route-classification";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export function buildGuestLoginRedirectSearch(
  reason: "auth_required" | "session_expired",
  blockedPathWithSearch: string
): string {
  const next = sanitizeLoginNextPath(sanitizeNextPath(blockedPathWithSearch));
  return next ? `?reason=${reason}&next=${encodeURIComponent(next)}` : `?reason=${reason}`;
}
