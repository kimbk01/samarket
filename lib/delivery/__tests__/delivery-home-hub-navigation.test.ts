import { describe, expect, it, vi } from "vitest";
import {
  runDeliveryHomeHubLongPress,
  runDeliveryHomeHubShortTap,
} from "@/lib/delivery/delivery-home-hub-navigation";

const baseArgs = {
  currentSearch: "",
  switcherOpen: false,
  onCloseSwitcher: vi.fn(),
  guardBeforeNavigate: () => true,
  beginMenuNavigation: vi.fn(),
  onNavigationIntent: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  longPressFired: false,
  onToggleSwitcher: vi.fn(),
};

describe("runDeliveryHomeHubShortTap", () => {
  it("짧은 탭 — 도메인 다이얼 토글(이동 없음)", () => {
    const push = vi.fn();
    const onToggleSwitcher = vi.fn();

    runDeliveryHomeHubShortTap({
      ...baseArgs,
      pathname: "/community-messenger/delivery-chats",
      push,
      onToggleSwitcher,
    });

    expect(onToggleSwitcher).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("다이얼 열림 상태 — 짧은 탭으로 닫기", () => {
    const onCloseSwitcher = vi.fn();
    const onToggleSwitcher = vi.fn();

    runDeliveryHomeHubShortTap({
      ...baseArgs,
      pathname: "/orders",
      switcherOpen: true,
      onCloseSwitcher,
      onToggleSwitcher,
    });

    expect(onCloseSwitcher).toHaveBeenCalled();
    expect(onToggleSwitcher).not.toHaveBeenCalled();
  });

  it("롱프레스 직후 pointerup — 중복 동작 없음", () => {
    const onToggleSwitcher = vi.fn();

    runDeliveryHomeHubShortTap({
      ...baseArgs,
      pathname: "/orders",
      longPressFired: true,
      onToggleSwitcher,
    });

    expect(onToggleSwitcher).not.toHaveBeenCalled();
  });
});

describe("runDeliveryHomeHubLongPress", () => {
  it("배달 홈이 아니면 /stores 로 push", () => {
    const push = vi.fn();

    runDeliveryHomeHubLongPress({
      pathname: "/community-messenger/delivery-chats",
      currentSearch: "",
      switcherOpen: false,
      onCloseSwitcher: vi.fn(),
      guardBeforeNavigate: () => true,
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      push,
      replace: vi.fn(),
    });

    expect(push).toHaveBeenCalledWith("/stores");
  });

  it("/stores 에서는 push 없이 스크롤만", () => {
    const push = vi.fn();

    runDeliveryHomeHubLongPress({
      pathname: "/stores",
      currentSearch: "",
      switcherOpen: false,
      onCloseSwitcher: vi.fn(),
      guardBeforeNavigate: () => true,
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      push,
      replace: vi.fn(),
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("다이얼 열림 상태에서 롱프레스 — 닫고 /stores 이동", () => {
    const onCloseSwitcher = vi.fn();
    const push = vi.fn();

    runDeliveryHomeHubLongPress({
      pathname: "/orders",
      currentSearch: "",
      switcherOpen: true,
      onCloseSwitcher,
      guardBeforeNavigate: () => true,
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      push,
      replace: vi.fn(),
    });

    expect(onCloseSwitcher).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/stores");
  });
});
