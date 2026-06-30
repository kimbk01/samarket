/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { playStoreOrderDeliveryAlertSound } from "@/lib/business/store-order-alert-sound";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(async () => {}),
}));

describe("playStoreOrderDeliveryAlertSound", () => {
  beforeEach(() => {
    vi.mocked(playEventNotificationSound).mockClear();
  });

  it("uses SSOT eventKey only (no legacy store-delivery-alert-sound fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await playStoreOrderDeliveryAlertSound();
    expect(playEventNotificationSound).toHaveBeenCalledWith("delivery_order_created_owner");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
