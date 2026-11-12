import {
  isCommunityMessengerCallPath,
  normalizeAppPathname,
} from "@/lib/navigation/community-messenger-deep-route-path";

/**
 * R3-A (Owner 「R3-A 승인」 2026-11-12 · docs/audit/call-r3-route-transition-plan-2026-11-12.md §2):
 * 화면 이동 연출에서 「통화 화면」으로 보는 주소 — 예전 `calls/**` 에 더해 실제 통화 화면 `calls-v4/**`(운영 경로)·`calls-v3/**`.
 * D1 S1 이 `calls/**` 만 제외해 v4 통화 화면 연출이 승인 없이 바뀌었던 것을 S1 이전(두 화면 연출)으로 되돌린다.
 * 연출 판정 전용 — 하단 탭 정책·통화 이동 잠금이 쓰는 공용 `isCommunityMessengerCallPath` 는 바꾸지 않는다.
 */
export function isCallSurfaceTransitionPath(pathname: string | null | undefined): boolean {
  if (isCommunityMessengerCallPath(pathname)) return true;
  const p = normalizeAppPathname(pathname);
  return p.startsWith("/community-messenger/calls-v4/") || p.startsWith("/community-messenger/calls-v3/");
}
