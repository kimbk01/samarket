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

const HUB_DOMAIN_LABEL_KEYS: Record<MainBottomNavHubDomain, MessageKey> = {
  philife: "nav_bottom_community",
  trade: "nav_bottom_trade",
  stores: "nav_bottom_delivery",
};

export function resolveHubDomainLabelKey(domain: MainBottomNavHubDomain): MessageKey {
  return HUB_DOMAIN_LABEL_KEYS[domain];
}
