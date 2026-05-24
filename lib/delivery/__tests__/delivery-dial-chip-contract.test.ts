import { describe, expect, it } from "vitest";
import {
  DELIVERY_DIAL_CHIP_HIT_CLASS,
  DELIVERY_DIAL_CHIP_HIT_SELECTOR,
  isDeliveryDialChipInteractionReady,
} from "@/lib/delivery/delivery-dial-chip-contract";

describe("delivery-dial-chip-contract", () => {
  it("hit selector는 CSS BEM 클래스와 일치", () => {
    expect(DELIVERY_DIAL_CHIP_HIT_SELECTOR).toBe(`.${DELIVERY_DIAL_CHIP_HIT_CLASS}`);
  });

  it("interactionReady — open·portal·entered 모두 true일 때만", () => {
    expect(isDeliveryDialChipInteractionReady(true, true, true)).toBe(true);
    expect(isDeliveryDialChipInteractionReady(true, true, false)).toBe(false);
    expect(isDeliveryDialChipInteractionReady(false, true, true)).toBe(false);
  });
});
