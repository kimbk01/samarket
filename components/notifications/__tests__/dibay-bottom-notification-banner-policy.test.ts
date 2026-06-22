import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isBottomBannerSuppressedByCallStatus,
  markAdminBannerReadBeforeHide,
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

  it("shows candidate when server feed is unread and not in display cooldown", () => {
    expect(shouldShowAdminBottomBannerCandidate(banner, false)).toBe(true);
  });

  it("treats local cooldown as display throttling, not read truth", () => {
    expect(shouldShowAdminBottomBannerCandidate(banner, true)).toBe(false);
    expect(shouldShowAdminBottomBannerCandidate(banner, false)).toBe(true);
  });

  it("keeps banner until server read succeeds (no session dismiss truth)", async () => {
    const markRead = vi.fn().mockResolvedValue(false);
    const ok = await markAdminBannerReadBeforeHide("evt-admin-1", { markRead });
    expect(ok).toBe(false);
    expect(markRead).toHaveBeenCalledWith("evt-admin-1", { dismissed: undefined });
  });

  it("allows hide only after server read succeeds", async () => {
    const markRead = vi.fn().mockResolvedValue(true);
    const ok = await markAdminBannerReadBeforeHide("evt-admin-1", { markRead });
    expect(ok).toBe(true);
  });

  it("passes dismissed flag on close without navigation", async () => {
    const markRead = vi.fn().mockResolvedValue(true);
    await markAdminBannerReadBeforeHide("evt-admin-1", { dismissed: true, markRead });
    expect(markRead).toHaveBeenCalledWith("evt-admin-1", { dismissed: true });
  });
});

describe("dibay bottom banner shell mount contract", () => {
  it("mounts DibayBottomNotificationBanner in MainAppProviderTree push layer", () => {
    const source = readFileSync(
      join(process.cwd(), "components/layout/MainAppProviderTree.tsx"),
      "utf8"
    );
    expect(source).toContain("DibayBottomNotificationBannerLazy");
    expect(source).toContain("<DibayBottomNotificationBannerLazy />");
  });
});
