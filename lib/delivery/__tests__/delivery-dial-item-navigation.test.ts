import { describe, expect, it, vi } from "vitest";
import { runDeliveryDialItemNavigation } from "@/lib/delivery/delivery-dial-item-navigation";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const storesTab: BottomNavItemConfig = {
  id: "stores",
  href: "/stores",
  label: "Delivery",
  icon: "stores",
};

describe("runDeliveryDialItemNavigation", () => {
  it("stores — 주문채팅 목록에서 배달 홈으로 push", () => {
    const push = vi.fn();
    const onClose = vi.fn();

    const ok = runDeliveryDialItemNavigation({
      tab: storesTab,
      href: "/stores",
      pathname: "/community-messenger/delivery-chats",
      onClose,
      guardBeforeNavigate: () => true,
      push,
      goBusinessHubOrModal: vi.fn(),
      shouldInterceptBusinessHubHref: () => false,
    });

    expect(ok).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/stores");
  });

  it("stores — 이미 /stores 이면 push 없음", () => {
    const push = vi.fn();

    runDeliveryDialItemNavigation({
      tab: storesTab,
      href: "/stores",
      pathname: "/stores",
      onClose: vi.fn(),
      guardBeforeNavigate: () => true,
      push,
      goBusinessHubOrModal: vi.fn(),
      shouldInterceptBusinessHubHref: () => false,
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("community — /philife 로 push", () => {
    const push = vi.fn();
    const tab: BottomNavItemConfig = {
      id: "community",
      href: "/philife",
      label: "Community",
      icon: "community",
    };

    runDeliveryDialItemNavigation({
      tab,
      href: "/philife",
      pathname: "/stores",
      onClose: vi.fn(),
      guardBeforeNavigate: () => true,
      push,
      goBusinessHubOrModal: vi.fn(),
      shouldInterceptBusinessHubHref: () => false,
    });

    expect(push).toHaveBeenCalledWith("/philife");
  });
});
