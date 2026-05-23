import { describe, expect, it } from "vitest";
import {
  DELIVERY_HOME_HUB_LONG_PRESS_MS,
  shouldToggleDeliveryDialOnHomePointerUp,
} from "@/lib/delivery/delivery-home-hub-gesture";

describe("delivery-home-hub-gesture", () => {
  it("짧은 탭 pointerup 은 다이얼 토글", () => {
    expect(shouldToggleDeliveryDialOnHomePointerUp(false)).toBe(true);
  });

  it("롱프레스 직후 pointerup 은 토글하지 않음", () => {
    expect(shouldToggleDeliveryDialOnHomePointerUp(true)).toBe(false);
  });

  it("롱프레스 임계값은 480ms", () => {
    expect(DELIVERY_HOME_HUB_LONG_PRESS_MS).toBe(480);
  });
});
