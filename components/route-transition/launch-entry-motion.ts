import { isLaunchOsReleased } from "@/lib/launch-intro/os-release-owner";
import { isCallSurfaceTransitionPath } from "@/components/route-transition/call-surface-transition-path";

/**
 * 감사 2026-11-26 §10 (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 단일 규칙:
 * **OS 화면이 아직 떠 있는 동안 붙거나 이동한 앱 시작 목적지는 진입 움직임 없이 제자리에 그린다.**
 *
 * - 진입 움직임은 사용자가 본 「이전 화면」 위로 덮어오는 연출이다. 시작 목적지(알림 탭·직전 화면 복원)에는 이전 화면이 없어
 *   뒤가 빈 바탕이고, OS 화면이 움직임 중간에 걷히면 흰 띠가 보인다(실기 2026-11-26 5/5회).
 * - 판정 = `isLaunchOsReleased()`(OS 해제 단일 경로 `tryDismissNativeSplash` 가 켬). 웹도 첫 목적지 뒤 켜진다 → 앱 안 이동은 그대로 움직인다.
 * - 통화 화면 경로는 제외(통화 변경 규정 — 통화 화면 연출 무변경).
 */
export function isLaunchEntryMotionSuppressed(nextPathname?: string | null): boolean {
  if (typeof window === "undefined") return false;
  if (isLaunchOsReleased()) return false;
  if (nextPathname != null && isCallSurfaceTransitionPath(nextPathname)) return false;
  return true;
}
