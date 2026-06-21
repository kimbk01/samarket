import { describe, expect, it } from "vitest";
import {
  isBottomBannerSuppressedByCallStatus,
  shouldShowAdminBottomBannerCandidate,
  type BannerFeedRow,
} from "@/components/notifications/DibayBottomNotificationBanner";

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

describe("dibay bottom banner dismiss policy", () => {
  const banner: BannerFeedRow = {
    id: "evt-admin-1",
    category: "admin_marketing_banner",
    title: "title",
    body: "body",
    routeUrl: "/community",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("uses session dismiss as an immediate loop guard when read fails", () => {
    expect(shouldShowAdminBottomBannerCandidate(banner, { "evt-admin-1": true }, false)).toBe(false);
  });

  it("treats local cooldown as display throttling, not read truth", () => {
    expect(shouldShowAdminBottomBannerCandidate(banner, {}, true)).toBe(false);
    expect(shouldShowAdminBottomBannerCandidate(banner, {}, false)).toBe(true);
  });
});
