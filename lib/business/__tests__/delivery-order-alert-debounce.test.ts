import { beforeEach, describe, expect, it, vi } from "vitest";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { playStoreOrderDeliveryAlertSound } from "@/lib/business/store-order-alert-sound";

vi.mock("@/lib/business/store-order-alert-sound", () => ({
  playStoreOrderDeliveryAlertSound: vi.fn(async () => {}),
}));

describe("playDeliveryOrderAlertDebounced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not play store_orders realtime sound; notification_events is the SSOT sound path", () => {
    playDeliveryOrderAlertDebounced("store-1");
    playDeliveryOrderAlertDebounced("store-1");

    expect(playStoreOrderDeliveryAlertSound).not.toHaveBeenCalled();
  });
});
