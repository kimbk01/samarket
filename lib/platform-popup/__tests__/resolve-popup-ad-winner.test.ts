import { describe, expect, it } from "vitest";
import {
  assertPlatformPopupActivationAllowed,
  canSetPlatformPopupApproval,
  canTransitionPlatformPopupStatus,
  isPlatformPopupStatusScheduleEligible,
} from "@/lib/platform-popup/campaign-lifecycle";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { resolvePopupAd } from "@/lib/platform-popup/resolve-popup-ad";

function baseCandidate(
  overrides: Partial<PlatformPopupCandidate> & { id: string }
): PlatformPopupCandidate {
  return {
    status: "active",
    approvalStatus: "approved",
    priority: 1,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2027-01-01T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: ["GLOBAL"],
    creative: { id: `cr-${overrides.id}`, status: "ready", aspectW: 36, aspectH: 25 },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ...overrides,
  };
}

describe("platform popup approval / eligibility — CUT 1", () => {
  it("DRAFT not eligible", () => {
    expect(isPlatformPopupStatusScheduleEligible("draft", "not_submitted")).toBe(false);
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [baseCandidate({ id: "c1", status: "draft", approvalStatus: "not_submitted" })],
    });
    expect(r.ok && r.winner).toBeNull();
  });

  it("PENDING_REVIEW not eligible", () => {
    expect(isPlatformPopupStatusScheduleEligible("pending_review", "pending_review")).toBe(false);
  });

  it("payment without Admin approval not eligible / cannot activate", () => {
    expect(
      assertPlatformPopupActivationAllowed({
        actor: "payment",
        nextStatus: "active",
        nextApproval: "approved",
      }).ok
    ).toBe(false);
    expect(canTransitionPlatformPopupStatus("approved", "active", "payment")).toBe(false);
    expect(canSetPlatformPopupApproval("pending_review", "approved", "payment")).toBe(false);
    expect(isPlatformPopupStatusScheduleEligible("active", "not_submitted")).toBe(false);
  });

  it("APPROVED + scheduled window eligible", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [
        baseCandidate({
          id: "c1",
          status: "scheduled",
          approvalStatus: "approved",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2027-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.winner?.campaignId).toBe("c1");
  });

  it("Admin revoked/paused not eligible", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [baseCandidate({ id: "c1", status: "paused", approvalStatus: "approved" })],
    });
    expect(r.ok && r.winner).toBeNull();
  });

  it("owner cannot approve or activate", () => {
    expect(canSetPlatformPopupApproval("pending_review", "approved", "owner")).toBe(false);
    expect(canTransitionPlatformPopupStatus("approved", "active", "owner")).toBe(false);
    expect(
      assertPlatformPopupActivationAllowed({
        actor: "owner",
        nextStatus: "active",
        nextApproval: "approved",
      }).ok
    ).toBe(false);
  });

  it("admin can approve and activate", () => {
    expect(canSetPlatformPopupApproval("pending_review", "approved", "admin")).toBe(true);
    expect(canTransitionPlatformPopupStatus("approved", "active", "admin")).toBe(true);
    expect(
      assertPlatformPopupActivationAllowed({
        actor: "admin",
        nextStatus: "active",
        nextApproval: "approved",
      }).ok
    ).toBe(true);
  });
});
