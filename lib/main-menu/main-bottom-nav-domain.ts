import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import type { MessageKey } from "@/lib/i18n/messages";

/** 하단 3대 허브 도메인 — 강조 UI·교차 팝업 판별 */
export type MainBottomNavHubDomain = "philife" | "trade" | "stores";

const HUB_DOMAINS: readonly MainBottomNavHubDomain[] = ["philife", "trade", "stores"];

export function isMainBottomNavHubDomain(value: string): value is MainBottomNavHubDomain {
  return (HUB_DOMAINS as readonly string[]).includes(value);
}

/** pathname → 현재 허브 도메인 (없으면 null) */
export function resolveMainBottomNavHubDomain(pathname: string | null | undefined): MainBottomNavHubDomain | null {
  const key = mainBottomNavPrefetchTriggerKey(pathname ?? null);
  if (key === "philife") return "philife";
  if (key === "trade") return "trade";
  if (key === "stores" || key === "store_owner") return "stores";
  return null;
}

/** 내장 탭 id → 목적지 허브 도메인 (chat·my 등은 null) */
export function resolveBuiltinTabHubDomain(tabId: string): MainBottomNavHubDomain | null {
  if (tabId === "community") return "philife";
  if (tabId === "home") return "trade";
  if (tabId === "stores") return "stores";
  return null;
}

/** 허브 강조 탭 짧은 탭 — 해당 도메인 홈으로 이동(이미 홈이면 스크롤) */
export function resolveMainBottomNavHubHomeHref(tabId: string): string | null {
  const domain = resolveBuiltinTabHubDomain(tabId);
  if (domain === "philife") return "/philife";
  if (domain === "trade") return "/market";
  if (domain === "stores") return "/stores";
  return null;
}

/** 현재 도메인에서 해당 탭 슬롯 orbit 강조 여부 */
export function isMainBottomNavHubEmphasisTab(
  tabId: string,
  currentHubDomain: MainBottomNavHubDomain | null
): boolean {
  if (currentHubDomain == null) return false;
  return resolveBuiltinTabHubDomain(tabId) === currentHubDomain;
}

/** 하단 탭 교차 확인 팝업 면제 — my·비허브 커스텀 탭 (chat·메신저 슬롯은 별도 확인) */
export function isMainBottomNavCrossDomainConfirmExemptTabId(tabId: string): boolean {
  if (tabId === "my") return true;
  if (tabId === "delivery-my" || tabId === "philife-my" || tabId === "trade-my") return true;
  if (
    tabId === "chat" ||
    tabId === "delivery-order-chat" ||
    tabId === "philife-messenger" ||
    tabId === "trade-order-chat"
  ) {
    return true;
  }
  return resolveBuiltinTabHubDomain(tabId) == null;
}

/** 3대 허브 탭 간 이동 시 확인 팝업 — chat·my·동일 도메인·비허브 탭은 false */
export function requiresCrossDomainConfirm(
  pathname: string | null | undefined,
  targetTabId: string
): boolean {
  if (isMainBottomNavCrossDomainConfirmExemptTabId(targetTabId)) return false;

  const targetHub = resolveBuiltinTabHubDomain(targetTabId);
  if (targetHub == null) return false;

  const fromHub = resolveMainBottomNavHubDomain(pathname);
  if (fromHub === targetHub) return false;

  return true;
}

const HUB_DOMAIN_LABEL_KEYS: Record<MainBottomNavHubDomain, MessageKey> = {
  philife: "nav_bottom_community",
  trade: "nav_bottom_trade",
  stores: "nav_bottom_delivery",
};

export function resolveHubDomainLabelKey(domain: MainBottomNavHubDomain): MessageKey {
  return HUB_DOMAIN_LABEL_KEYS[domain];
}

export type CrossDomainConfirmCopy =
  | { kind: "from_to"; fromLabelKey: MessageKey; toLabelKey: MessageKey }
  | { kind: "to_only"; toLabelKey: MessageKey };

/** 확인 모달 문구용 i18n key·파라미터 조합 */
export function resolveCrossDomainConfirmCopy(
  pathname: string | null | undefined,
  targetTabId: string
): CrossDomainConfirmCopy | null {
  if (!requiresCrossDomainConfirm(pathname, targetTabId)) return null;
  const toHub = resolveBuiltinTabHubDomain(targetTabId);
  if (toHub == null) return null;

  const fromHub = resolveMainBottomNavHubDomain(pathname);
  const toLabelKey = resolveHubDomainLabelKey(toHub);
  if (fromHub == null) {
    return { kind: "to_only", toLabelKey };
  }
  return {
    kind: "from_to",
    fromLabelKey: resolveHubDomainLabelKey(fromHub),
    toLabelKey,
  };
}
