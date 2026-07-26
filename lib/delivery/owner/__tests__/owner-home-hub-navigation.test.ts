import { describe, expect, it, vi } from "vitest";
import {
  isOwnerHomeHubBottomNavActive,
  runOwnerHomeHubShortTap,
} from "@/lib/delivery/owner/owner-home-hub-navigation";

vi.mock("@/lib/layout/scroll-app-shell-to-top", () => ({
  scrollAppShellToTop: vi.fn(),
}));

describe("owner home hub navigation", () => {
  it("detects owner dashboard as home hub active", () => {
    expect(isOwnerHomeHubBottomNavActive("/stores/owner")).toBe(true);
    expect(isOwnerHomeHubBottomNavActive("/stores/owner/orders")).toBe(false);
  });

  it("pushes dashboard when not already there", () => {
    const push = vi.fn();
    runOwnerHomeHubShortTap({
      pathname: "/stores/owner/orders",
      href: "/stores/owner?storeId=s1",
      switcherOpen: false,
      onCloseSwitcher: vi.fn(),
      guardBeforeNavigate: () => true,
      onNavigationIntent: vi.fn(),
      push,
    });
    expect(push).toHaveBeenCalledWith("/stores/owner?storeId=s1");
  });
});
