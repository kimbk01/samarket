import { describe, expect, it } from "vitest";
import { resolveDeliveryDialIconComponent } from "@/lib/delivery/delivery-domain-switcher-icons";
import {
  MAIN_BOTTOM_NAV_TAB_ICONS,
  StoreOpsCenterStrokeIcon,
} from "@/components/main-menu/MainBottomNavTabIcons";

describe("delivery-domain-switcher-icons", () => {
  it("도메인 탭 — 하단 네비와 동일 컴포넌트", () => {
    expect(resolveDeliveryDialIconComponent("community")).toBe(MAIN_BOTTOM_NAV_TAB_ICONS.community);
    expect(resolveDeliveryDialIconComponent("trade")).toBe(MAIN_BOTTOM_NAV_TAB_ICONS.trade);
    expect(resolveDeliveryDialIconComponent("chat")).toBe(MAIN_BOTTOM_NAV_TAB_ICONS.chat);
  });

  it("운영센터 — 헤더 StoreOpsCenterStrokeIcon", () => {
    expect(resolveDeliveryDialIconComponent("owner_hub")).toBe(StoreOpsCenterStrokeIcon);
  });
});
