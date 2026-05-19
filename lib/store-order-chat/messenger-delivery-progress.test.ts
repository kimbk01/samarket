import { describe, expect, it } from "vitest";
import {
  messengerDeliveryProgressCurrentStep,
  messengerDeliveryProgressFillRatio,
} from "@/lib/store-order-chat/messenger-delivery-progress";

describe("messengerDeliveryProgressFillRatio", () => {
  it("accepted fills toward next step (before preparing)", () => {
    expect(messengerDeliveryProgressCurrentStep("accepted", "local_delivery")).toBe(1);
    expect(messengerDeliveryProgressFillRatio("accepted", "local_delivery")).toBe(0.5);
  });

  it("pending fills toward accepted", () => {
    expect(messengerDeliveryProgressFillRatio("pending", "local_delivery")).toBe(0.25);
  });

  it("completed fills full bar", () => {
    expect(messengerDeliveryProgressFillRatio("completed", "local_delivery")).toBe(1);
  });
});
