import { OWNER_COMPACT_SHELL_BODY_DATA_ATTR } from "@/lib/business/owner-compact-shell-layout";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { getOwnerCompactShellScrollTopSnapshot } from "@/lib/layout/subscribe-owner-compact-shell-scroll";

/** 오너 compact 셸 — body 스크롤이 잠긴 상태에서 내부 scroll 루트 Y */
export function isOwnerCompactShellScrollContext(): boolean {
  return (
    typeof document !== "undefined" &&
    document.body.hasAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR)
  );
}

/**
 * 메인 앱·매장 오너 compact 공통 — 현재 세로 스크롤 Y.
 * (P2R·하단 탭 숨김 등 body overflow:hidden 화면에서 내부 scrollTop 사용)
 */
export function resolveAppShellScrollTopY(): number {
  if (isOwnerCompactShellScrollContext()) {
    return getOwnerCompactShellScrollTopSnapshot();
  }
  return getMainAppScrollTop();
}
