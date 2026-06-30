import { describe, expect, it } from "vitest";
import {
  isLegacyDibayDeviceId,
  isUuidDeviceId,
  shouldActivateFcmDeviceRegister,
} from "@/lib/push/device-register/should-activate-fcm-device-register";

describe("shouldActivateFcmDeviceRegister", () => {
  const now = Date.parse("2026-06-30T12:00:00.000Z");
  const freshUuid = {
    device_id: "cabc4186-4d32-46b5-b1c9-f218253eb3ec",
    last_seen_at: "2026-06-30T11:00:00.000Z",
  };

  it("detects uuid and legacy dibay ids", () => {
    expect(isUuidDeviceId("cabc4186-4d32-46b5-b1c9-f218253eb3ec")).toBe(true);
    expect(isLegacyDibayDeviceId("dibay-mr00h95r-j4u9998tjx")).toBe(true);
  });

  it("blocks legacy dibay register when fresher uuid peer exists", () => {
    expect(
      shouldActivateFcmDeviceRegister("dibay-mr00h95r-j4u9998tjx", "fcm", [freshUuid], now),
    ).toBe(false);
  });

  it("allows uuid register and legacy register without fresh uuid peer", () => {
    expect(
      shouldActivateFcmDeviceRegister("cabc4186-4d32-46b5-b1c9-f218253eb3ec", "fcm", [freshUuid], now),
    ).toBe(true);
    expect(shouldActivateFcmDeviceRegister("dibay-mr00h95r-j4u9998tjx", "fcm", [], now)).toBe(true);
  });
});
