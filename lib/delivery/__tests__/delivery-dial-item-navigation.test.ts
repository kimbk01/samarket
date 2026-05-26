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
  it("stores — 주문채팅 목록에서 배달 홈으로 replace", () => {
    const replace = vi.fn();
    const onClose = vi.fn();

    const ok = runDeliveryDialItemNavigation(dialArgs({ replace, onClose }));

    expect(ok).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/stores");
  });

  it("navigate 후 onClose", () => {
    const order: string[] = [];
    const replace = vi.fn(() => order.push("replace"));
    const onClose = vi.fn(() => order.push("close"));

    runDeliveryDialItemNavigation(dialArgs({ replace, onClose }));

    expect(order).toEqual(["replace", "close"]);
  });

  it("stores — tab.href 오염과 무관하게 /stores", () => {
    const replace = vi.fn();
    const polluted: BottomNavItemConfig = {
      ...storesTab,
      href: "/community-messenger/delivery-chats?from=delivery",
    };

    runDeliveryDialItemNavigation(dialArgs({ tab: polluted, replace }));

    expect(replace).toHaveBeenCalledWith("/stores");
  });

  it("stores — 이미 /stores 이면 replace 없음·onClose", () => {
    const replace = vi.fn();
    const onClose = vi.fn();

    runDeliveryDialItemNavigation(dialArgs({ pathname: "/stores", currentSearch: "", replace, onClose }));

    expect(replace).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("guard 실패 시 blocked", () => {
    const replace = vi.fn();
    const onClose = vi.fn();
    const ok = runDeliveryDialItemNavigation(
      dialArgs({
        pathname: "/orders",
        replace,
        onClose,
        guardBeforeNavigate: () => false,
      })
    );
    expect(ok).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("chat — 동일 배달 레일이면 scroll_only", () => {
    const replace = vi.fn();
    const push = vi.fn();
    const onClose = vi.fn();
    const tab: BottomNavItemConfig = {
      id: "chat",
      href: "/community-messenger?section=chats",
      label: "Messenger",
      icon: "chat",
    };

    runDeliveryDialItemNavigation(dialArgs({ tab, replace, push, onClose }));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
