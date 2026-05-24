import { describe, expect, it, vi } from "vitest";
import { runDeliveryDialItemNavigation } from "@/lib/delivery/delivery-dial-item-navigation";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const storesTab: BottomNavItemConfig = {
  id: "stores",
  href: "/stores",
  label: "Delivery",
  icon: "stores",
};

function dialArgs(overrides: Partial<Parameters<typeof runDeliveryDialItemNavigation>[0]> = {}) {
  return {
    tab: storesTab,
    pathname: "/community-messenger/delivery-chats",
    currentSearch: "from=delivery",
    onClose: vi.fn(),
    guardBeforeNavigate: () => true,
    beginMenuNavigation: vi.fn(),
    onNavigationIntent: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    goBusinessHubOrModal: vi.fn(),
    shouldInterceptBusinessHubHref: () => false,
    ...overrides,
  };
}

describe("runDeliveryDialItemNavigation", () => {
  it("stores — 주문채팅 목록에서 배달 홈으로 push", () => {
    const push = vi.fn();
    const onClose = vi.fn();

    const ok = runDeliveryDialItemNavigation(dialArgs({ push, onClose }));

    expect(ok).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/stores");
  });

  it("navigate 후 onClose", () => {
    const order: string[] = [];
    const push = vi.fn(() => order.push("push"));
    const onClose = vi.fn(() => order.push("close"));

    runDeliveryDialItemNavigation(dialArgs({ push, onClose }));

    expect(order).toEqual(["push", "close"]);
  });

  it("stores — tab.href 오염과 무관하게 /stores", () => {
    const push = vi.fn();
    const polluted: BottomNavItemConfig = {
      ...storesTab,
      href: "/community-messenger/delivery-chats?from=delivery",
    };

    runDeliveryDialItemNavigation(dialArgs({ tab: polluted, push }));

    expect(push).toHaveBeenCalledWith("/stores");
  });

  it("stores — 이미 /stores 이면 push 없음·onClose", () => {
    const push = vi.fn();
    const onClose = vi.fn();

    runDeliveryDialItemNavigation(dialArgs({ pathname: "/stores", currentSearch: "", push, onClose }));

    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("guard 실패 시 blocked", () => {
    const push = vi.fn();
    const onClose = vi.fn();
    const ok = runDeliveryDialItemNavigation(
      dialArgs({
        pathname: "/orders",
        push,
        onClose,
        guardBeforeNavigate: () => false,
      })
    );
    expect(ok).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("chat — 배달 레일 주문채팅 href", () => {
    const push = vi.fn();
    const tab: BottomNavItemConfig = {
      id: "chat",
      href: "/community-messenger?section=chats",
      label: "Messenger",
      icon: "chat",
    };

    runDeliveryDialItemNavigation(dialArgs({ tab, push }));

    expect(push).toHaveBeenCalledWith("/community-messenger/delivery-chats?from=delivery");
  });
});
