import {
  isMainBottomNavUnifiedInboxTabId,
} from "@/lib/community-messenger/messenger-entry-origin";
import {
  resolveCrossDomainConfirmCopy,
  type CrossDomainConfirmCopy,
} from "@/lib/main-menu/main-bottom-nav-domain";
import {
  isMainBottomNavRiskyNavigation,
  MAIN_BOTTOM_NAV_SAFE_RISKY_STATE,
  type MainBottomNavRiskyNavigationState,
} from "@/lib/navigation/main-bottom-nav-risky-navigation";

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
 * Phase B: risky navigation 시에만 재활성화 후보.
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

/** Phase B 재활성화용 — 교육용 messenger copy */
function resolveMessengerTransitionConfirmCopy(
  pathname: string | null | undefined,
  targetTabId: string
): BottomNavTransitionConfirmCopy | null {
  if (!requiresMessengerTabConfirm(pathname, targetTabId)) return null;
  return { kind: "messenger" };
}

/** Phase B 재활성화용 — 교육용 cross-domain copy */
function resolveCrossDomainTransitionConfirmCopy(
  pathname: string | null | undefined,
  targetTabId: string
): BottomNavTransitionConfirmCopy | null {
  const cross = resolveCrossDomainConfirmCopy(pathname, targetTabId);
  if (!cross) return null;
  return { kind: "cross_domain", copy: cross };
}

/**
 * 하단 탭 확인 팝업 단일 판별.
 *
 * CONTRACT — Phase A: read-only(safe) navigation 은 **항상 null** (즉시 commit).
 * 데이터 보호: `useInlineWriteSheetNavigationGuard`·cart/checkout Confirm 등 domain guard.
 * Phase B: `isMainBottomNavRiskyNavigation(riskyState)` 일 때만 messenger/cross-domain copy 반환.
 */
export function resolveBottomNavTransitionConfirmCopy(
  pathname: string | null | undefined,
  targetTabId: string,
  riskyState: MainBottomNavRiskyNavigationState = MAIN_BOTTOM_NAV_SAFE_RISKY_STATE
): BottomNavTransitionConfirmCopy | null {
  if (!isMainBottomNavRiskyNavigation(riskyState)) {
    return null;
  }
  const messenger = resolveMessengerTransitionConfirmCopy(pathname, targetTabId);
  if (messenger) return messenger;
  return resolveCrossDomainTransitionConfirmCopy(pathname, targetTabId);
}
