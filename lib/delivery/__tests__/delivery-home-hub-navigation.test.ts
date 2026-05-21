import { describe, expect, it, vi } from "vitest";
import { runDeliveryHomeHubShortTap } from "@/lib/delivery/delivery-home-hub-navigation";

describe("runDeliveryHomeHubShortTap", () => {
  it("배달 홈이 아니면 /stores 로 push", () => {
    const push = vi.fn();
    const beginMenuNavigation = vi.fn();
    const onNavigationIntent = vi.fn();
    const onCloseSwitcher = vi.fn();

    const ok = runDeliveryHomeHubShortTap({
      pathname: "/community-messenger/delivery-chats",
      currentSearch: "",
      switcherOpen: false,
      onCloseSwitcher,
      guardBeforeNavigate: () => true,
      beginMenuNavigation,
      onNavigationIntent,
      push,
    });

    expect(ok).toBe(true);
    expect(beginMenuNavigation).toHaveBeenCalledWith("/stores");
    expect(onNavigationIntent).toHaveBeenCalledWith("delivery-home-hub");
    expect(push).toHaveBeenCalledWith("/stores");
    expect(onCloseSwitcher).not.toHaveBeenCalled();
  });

  it("/stores 에서는 push 없이 스크롤만", () => {
    const push = vi.fn();
    const beginMenuNavigation = vi.fn();

    runDeliveryHomeHubShortTap({
      pathname: "/stores",
      currentSearch: "",
      switcherOpen: false,
      onCloseSwitcher: vi.fn(),
      guardBeforeNavigate: () => true,
      beginMenuNavigation,
      onNavigationIntent: vi.fn(),
      push,
    });

    expect(push).not.toHaveBeenCalled();
    expect(beginMenuNavigation).not.toHaveBeenCalled();
  });

  it("다이얼 열림 상태에서 탭하면 먼저 닫기", () => {
    const onCloseSwitcher = vi.fn();
    runDeliveryHomeHubShortTap({
      pathname: "/orders",
      currentSearch: "",
      switcherOpen: true,
      onCloseSwitcher,
      guardBeforeNavigate: () => true,
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      push: vi.fn(),
    });
    expect(onCloseSwitcher).toHaveBeenCalled();
  });
});
