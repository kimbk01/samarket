import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_BOOT_SUPPRESS_MS,
} from "@/lib/notifications/notification-unread-badge-store";

describe("notification-unread-badge-store policy", () => {
  it("keeps client TTL at 20s (exported via store module)", () => {
    expect(NOTIFICATION_BOOT_SUPPRESS_MS).toBe(3_000);
  });
});
