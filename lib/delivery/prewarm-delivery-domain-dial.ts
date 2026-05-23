import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";
import {
  composeDeliveryDomainSwitcherSlots,
  type ComposeDeliveryDomainSwitcherSlotsOptions,
} from "@/lib/delivery/delivery-domain-switcher-slots";
import type { DeliveryDomainSwitcherSlot } from "@/lib/delivery/delivery-domain-switcher-slots";
import { storeHomeFeedSuffixFromUserPrimaryRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import type { UserRegion } from "@/lib/regions/types";

function resolveDialHref(tab: BottomNavItemConfig): string {
  if (tab.id === "chat") return mainBottomNavMessengerTabHref("delivery");
  return tab.href;
}

/**
 * 다이얼이 열릴 때 칩 목적지 RSC·클라 캐시를 미리 데운다.
 * (탭 선택 시 `router.push` 만으로는 DATA 캐시 미스가 남을 수 있음)
 */
export function prewarmDeliveryDomainDialTargets(
  slots: readonly DeliveryDomainSwitcherSlot[],
  opts?: {
    primaryRegion?: UserRegion | null;
    prefetch?: (href: string) => void;
  }
): void {
  if (typeof window === "undefined") return;
  const suffix = storeHomeFeedSuffixFromUserPrimaryRegion(opts?.primaryRegion ?? null);
  const suffixes = suffix ? [suffix] : [];
  const seen = new Set<string>();

  for (const slot of slots) {
    if (slot.kind !== "action") continue;
    const href = resolveDialHref(slot.tab).trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    try {
      opts?.prefetch?.(href);
    } catch {
      /* noop */
    }
    try {
      prewarmBottomNavTapTargetClientCache(href, { storeHomeFeedSuffixes: suffixes });
    } catch {
      /* noop */
    }
  }
}

/** 하단 홈 다이얼이 열리기 직전·직후 — 소비자 배달 레일 */
export function prewarmConsumerDeliveryDomainDial(
  ownerStoreId: string | null | undefined,
  opts?: {
    primaryRegion?: UserRegion | null;
    prefetch?: (href: string) => void;
    slotOptions?: ComposeDeliveryDomainSwitcherSlotsOptions;
  }
): void {
  prewarmDeliveryDomainDialTargets(
    composeDeliveryDomainSwitcherSlots(ownerStoreId, opts?.slotOptions),
    opts
  );
}
