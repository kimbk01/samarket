import { describe, expect, it } from "vitest";
import { isBottomBannerSuppressedByCallStatus } from "@/components/notifications/DibayBottomNotificationBanner";

describe("dibay bottom banner call suppression", () => {
  it("suppresses banner during incoming/active call states", () => {
    expect(isBottomBannerSuppressedByCallStatus("incoming")).toBe(true);
    expect(isBottomBannerSuppressedByCallStatus("outgoing")).toBe(true);
    expect(isBottomBannerSuppressedByCallStatus("connecting")).toBe(true);
    expect(isBottomBannerSuppressedByCallStatus("ringing")).toBe(true);
    expect(isBottomBannerSuppressedByCallStatus("active")).toBe(true);
    expect(isBottomBannerSuppressedByCallStatus("minimized")).toBe(true);
  });

  it("releases suppression when call ends", () => {
    expect(isBottomBannerSuppressedByCallStatus("idle")).toBe(false);
    expect(isBottomBannerSuppressedByCallStatus("ended")).toBe(false);
    expect(isBottomBannerSuppressedByCallStatus("failed")).toBe(false);
  });
});
