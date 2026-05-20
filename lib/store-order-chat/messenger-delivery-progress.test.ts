import { describe, expect, it } from "vitest";
import {
  messengerDeliveryProgressCurrentStep,
  messengerDeliveryProgressFillRatio,
} from "@/lib/store-order-chat/messenger-delivery-progress";

describe("messengerDeliveryProgressFillRatio", () => {
  it("accepted fills toward 준비(조리)중", () => {
    expect(messengerDeliveryProgressCurrentStep("accepted", "local_delivery")).toBe(1);
    expect(messengerDeliveryProgressFillRatio("accepted", "local_delivery")).toBeCloseTo(2 / 3, 5);
  });

  it("pending fills toward 주문접수", () => {
    expect(messengerDeliveryProgressFillRatio("pending", "local_delivery")).toBeCloseTo(1 / 3, 5);
  });

  it("completed fills full bar", () => {
    expect(messengerDeliveryProgressFillRatio("completed", "local_delivery")).toBe(1);
  });
});
