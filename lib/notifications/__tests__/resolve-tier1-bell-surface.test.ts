import { describe, expect, it } from "vitest";
import {
  badgeSurfaceToPriorityPushKind,
  resolveTier1BellListFetchOpts,
  resolveTier1BellMarkAllReadBody,
  resolveTier1BellSurfaceFromPathname,
  resolveTier1BellUnreadFetchUrl,
} from "@/lib/notifications/resolve-tier1-bell-surface";

describe("resolveTier1BellSurfaceFromPathname", () => {
  it("maps messenger to bottom_nav_chat", () => {
    expect(resolveTier1BellSurfaceFromPathname("/community-messenger")).toBe("bottom_nav_chat");
  });

  it("maps philife to bottom_nav_community", () => {
    expect(resolveTier1BellSurfaceFromPathname("/philife")).toBe("bottom_nav_community");
  });

  it("maps market to bottom_nav_my", () => {
    expect(resolveTier1BellSurfaceFromPathname("/market")).toBe("bottom_nav_my");
  });

  it("maps stores and orders to bottom_nav_delivery", () => {
    expect(resolveTier1BellSurfaceFromPathname("/stores")).toBe("bottom_nav_delivery");
    expect(resolveTier1BellSurfaceFromPathname("/orders")).toBe("bottom_nav_delivery");
  });

  it("maps owner routes to owner_commerce_inbox", () => {
    expect(resolveTier1BellSurfaceFromPathname("/stores/owner")).toBe("owner_commerce_inbox");
    expect(resolveTier1BellSurfaceFromPathname("/stores/owner/orders")).toBe("owner_commerce_inbox");
  });

  it("defaults to tier1_inbox_bell", () => {
    expect(resolveTier1BellSurfaceFromPathname("/mypage")).toBe("tier1_inbox_bell");
  });
});

describe("resolveTier1BellUnreadFetchUrl", () => {
  it("uses badge_surface query param", () => {
    expect(resolveTier1BellUnreadFetchUrl("bottom_nav_delivery")).toBe(
      "/api/me/notifications?unread_count_only=1&badge_surface=bottom_nav_delivery"
    );
  });

  it("includes owner_store_id for owner surface", () => {
    expect(resolveTier1BellUnreadFetchUrl("owner_commerce_inbox", "store-1")).toBe(
      "/api/me/notifications?unread_count_only=1&badge_surface=owner_commerce_inbox&owner_store_id=store-1"
    );
  });
});

describe("resolveTier1BellListFetchOpts", () => {
  it("excludes chat + store ops + missed for full tier1 inbox (Bell = member A)", () => {
    expect(resolveTier1BellListFetchOpts("tier1_inbox_bell")).toEqual({
      excludeChatMessages: true,
      excludeOwnerStoreCommerce: true,
      excludeMissedCalls: true,
      pushKind: "all",
    });
  });

  it("uses chat push kind for messenger surface", () => {
    expect(resolveTier1BellListFetchOpts("bottom_nav_chat")).toEqual({ pushKind: "chat" });
  });

  it("delivery surface excludes owner store commerce (owner has own surface)", () => {
    expect(resolveTier1BellListFetchOpts("bottom_nav_delivery")).toEqual({
      excludeChatMessages: true,
      excludeOwnerStoreCommerce: true,
      pushKind: "delivery",
    });
  });
});

describe("resolveTier1BellMarkAllReadBody", () => {
  it("prefers loaded unread ids", () => {
    expect(resolveTier1BellMarkAllReadBody("bottom_nav_chat", ["a", "b"])).toEqual({
      ids: ["a", "b"],
    });
  });

  it("falls back to owner commerce mark-all", () => {
    expect(resolveTier1BellMarkAllReadBody("owner_commerce_inbox", [])).toEqual({
      mark_all_owner_store_commerce_read: true,
    });
  });

  it("falls back to chat-only mark-all", () => {
    expect(resolveTier1BellMarkAllReadBody("bottom_nav_chat", [])).toEqual({
      mark_my_chat_notifications_read: true,
    });
  });

  it("falls back to full Bell mark-all for tier1 inbox", () => {
    expect(resolveTier1BellMarkAllReadBody("tier1_inbox_bell", [])).toEqual({
      mark_all_read: true,
    });
  });

  it("falls back to tier1 excluding owner and chat for filtered surfaces", () => {
    expect(resolveTier1BellMarkAllReadBody("bottom_nav_my", [])).toEqual({
      mark_my_notifications_read_excluding_owner_and_chat: true,
    });
  });
});

describe("badgeSurfaceToPriorityPushKind", () => {
  it("returns null for tier1 all inbox", () => {
    expect(badgeSurfaceToPriorityPushKind("tier1_inbox_bell")).toBeNull();
  });

  it("returns trade for market surface", () => {
    expect(badgeSurfaceToPriorityPushKind("bottom_nav_my")).toBe("trade");
  });
});
