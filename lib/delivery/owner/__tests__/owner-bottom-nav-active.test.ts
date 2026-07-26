import { describe, expect, it } from "vitest";
import { resolveOwnerBottomNavActiveTabId } from "@/lib/delivery/owner/owner-bottom-nav-active";

describe("resolveOwnerBottomNavActiveTabId", () => {
  const search = { get: () => null };

  it("maps owner routes to five tabs", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner", search)).toBe("home");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/orders", search)).toBe("orders");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chats", search)).toBe(
      "order-chat"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chat/abc", search)).toBe(
      "order-chat"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/menu", search)).toBe("menu");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/settings", search)).toBe("settings");
  });

  it("does not treat consumer store menu as home tab", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/my-store", search, "my-store")).toBeNull();
  });
});
