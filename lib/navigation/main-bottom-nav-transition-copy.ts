import {
  isMainBottomNavUnifiedInboxTabId,
} from "@/lib/community-messenger/messenger-entry-origin";
import {
  resolveCrossDomainConfirmCopy,
  type CrossDomainConfirmCopy,
} from "@/lib/main-menu/main-bottom-nav-domain";

export type BottomNavTransitionConfirmCopy =
  | { kind: "messenger" }
  | { kind: "cross_domain"; copy: CrossDomainConfirmCopy };

function normalizePathKey(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim() ?? "";
}

/** 메신저 탭 id — 하단 chat·레거시 chat 슬롯 */
export function isMainBottomNavMessengerTabId(tabId: string): boolean {
  return isMainBottomNavUnifiedInboxTabId(tabId);
}

/**
 * 메신저 탭 — 다른 표면에서 `/community-messenger` 로 갈 때 확인 팝업.
 * 이미 메신저 셸이면 false(재탭·스크롤만).
 */
export function requiresMessengerTabConfirm(
  pathname: string | null | undefined,
  targetTabId: string
): boolean {
  if (!isMainBottomNavMessengerTabId(targetTabId)) return false;
  const p = normalizePathKey(pathname);
  if (p === "/community-messenger" || p.startsWith("/community-messenger/")) return false;
  return true;
}

/**
 * 하단 탭 확인 팝업 단일 판별 — 메신저 우선, 그다음 3대 허브 교차.
 *
 * CONTRACT — hub 교차·메신저 진입 시 교육용 Confirm 노출(확인 후 commit).
 * 데이터 보호: `useInlineWriteSheetNavigationGuard`·cart/checkout Confirm 등 domain guard.
 * 확인 모달 노출 시점 prewarm은 `BottomNav` `commitTabRouteWithConfirm`.
 */
export function resolveBottomNavTransitionConfirmCopy(
  pathname: string | null | undefined,
  targetTabId: string
): BottomNavTransitionConfirmCopy | null {
  if (requiresMessengerTabConfirm(pathname, targetTabId)) {
    return { kind: "messenger" };
  }
  const cross = resolveCrossDomainConfirmCopy(pathname, targetTabId);
  if (cross) return { kind: "cross_domain", copy: cross };
  return null;
}
