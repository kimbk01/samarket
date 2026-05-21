import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { MessageKey } from "@/lib/i18n/messages";
import type { DeliveryDialIconKey } from "@/lib/delivery/delivery-domain-switcher-icons";
import { DELIVERY_DIAL_SLOT_COUNT } from "@/lib/delivery/delivery-domain-switcher-arc";

/** 다이얼 슬롯 수 — 비매장주도 6칸(운영센터 자리는 빈 공간) */
export { DELIVERY_DIAL_SLOT_COUNT as DELIVERY_DOMAIN_SWITCHER_SLOT_COUNT };

/** 배달홈 스위처 — 커뮤니티·거래·배달·메신저 (내정보는 하단 탭만, 다이얼 제외) */
export const DELIVERY_DOMAIN_SWITCHER_BASE_ITEMS: readonly BottomNavItemConfig[] = BOTTOM_NAV_ITEMS.filter(
  (tab) => tab.id !== "my"
);

export type DeliveryDomainSwitcherSlot =
  | {
      kind: "action";
      tab: BottomNavItemConfig;
      dialIcon: DeliveryDialIconKey;
    }
  | {
      kind: "placeholder";
      slotId: "delivery-my-reserved" | "delivery-ops-reserved";
    };

function baseDialIcon(tab: BottomNavItemConfig): DeliveryDialIconKey {
  if (tab.icon === "home") return "trade";
  return tab.icon;
}

const MY_INFO_SLOT_PLACEHOLDER: DeliveryDomainSwitcherSlot = {
  kind: "placeholder",
  slotId: "delivery-my-reserved",
};

/**
 * 6슬롯 고정: 커뮤니티·거래·배달·메신저 · (내정보 빈칸) · (매장주)운영센터 | (비매장주)빈칸.
 * 5개로 재배치하지 않음 — 각도·간격은 6칸 그대로.
 */
export function composeDeliveryDomainSwitcherSlots(ownerStoreId?: string | null): DeliveryDomainSwitcherSlot[] {
  const sid = typeof ownerStoreId === "string" ? ownerStoreId.trim() : "";
  const base: DeliveryDomainSwitcherSlot[] = DELIVERY_DOMAIN_SWITCHER_BASE_ITEMS.map((tab) => ({
    kind: "action",
    tab,
    dialIcon: baseDialIcon(tab),
  }));

  if (sid) {
    return [
      ...base,
      MY_INFO_SLOT_PLACEHOLDER,
      {
        kind: "action",
        tab: {
          id: "delivery-ops-center",
          href: OwnerRoutes.hub(sid),
          label: "Operations hub",
          labelKey: "store_delivery_float_ops_center" as MessageKey,
          icon: "stores",
        },
        dialIcon: "owner_hub",
      },
    ];
  }

  return [...base, MY_INFO_SLOT_PLACEHOLDER, { kind: "placeholder", slotId: "delivery-ops-reserved" }];
}
