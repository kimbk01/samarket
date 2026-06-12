import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_BOOT_SUPPRESS_MS,
  notificationUnreadPollingActiveForPath,
} from "@/lib/notifications/notification-unread-badge-store";

describe("notification-unread-badge-store policy", () => {
  it("keeps client TTL at 20s (exported via store module)", () => {
    expect(NOTIFICATION_BOOT_SUPPRESS_MS).toBe(3_000);
  });

  it("allows only bottom_nav_delivery poll on /stores (Baemin shell)", () => {
    expect(notificationUnreadPollingActiveForPath("/stores", "bottom_nav_delivery")).toBe(true);
    expect(notificationUnreadPollingActiveForPath("/stores", "bottom_nav_chat")).toBe(false);
    expect(notificationUnreadPollingActiveForPath("/stores", "bottom_nav_community")).toBe(false);
    expect(notificationUnreadPollingActiveForPath("/stores", "bottom_nav_my")).toBe(false);
  });

  it("allows bottom_nav_chat poll only on community-messenger", () => {
    expect(notificationUnreadPollingActiveForPath("/community-messenger", "bottom_nav_chat")).toBe(true);
    expect(notificationUnreadPollingActiveForPath("/community-messenger", "bottom_nav_delivery")).toBe(
      false
    );
  });

  it("maps bottom_nav_legacy poll to /market (bottom_nav_my surface)", () => {
    expect(notificationUnreadPollingActiveForPath("/market", "bottom_nav_legacy")).toBe(true);
    expect(notificationUnreadPollingActiveForPath("/stores", "bottom_nav_legacy")).toBe(false);
  });
});
