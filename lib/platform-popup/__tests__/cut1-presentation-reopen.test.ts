import { describe, expect, it } from "vitest";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { resolvePopupAd } from "@/lib/platform-popup/resolve-popup-ad";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";

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
    presentationType: "center_modal",
    frequencyMode: "once_per_session",
    creative: {
      id: `cr-${overrides.id}`,
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: "card",
    },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ...overrides,
  };
}

describe("CUT1 presentation reopen — rotation + home surface", () => {
  it("home `/` resolves to COMMUNITY", () => {
    expect(resolveDibaySurface("/")).toBe("COMMUNITY");
  });

  it("rotates to least-recently-shown over higher priority when both eligible", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [
        baseCandidate({
          id: "high-priority-shown",
          priority: 100,
          lastImpressionAt: "2026-05-01T00:00:00.000Z",
        }),
        baseCandidate({
          id: "low-priority-never",
          priority: 1,
          lastImpressionAt: null,
        }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.winner?.campaignId).toBe("low-priority-never");
  });

  it("returns exactly one winner", () => {
    const r = resolvePopupAd({
      pathname: "/philife",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [
        baseCandidate({ id: "a", priority: 5 }),
        baseCandidate({ id: "b", priority: 4 }),
      ],
    });
    expect(r.ok && r.winner).toBeTruthy();
    if (r.ok && r.winner) {
      expect(r.winner.presentationType).toBe("center_modal");
      expect(r.winner.frequencyMode).toBe("once_per_session");
    }
  });

  it("skips non-interruptive banner presentations", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [baseCandidate({ id: "banner", presentationType: "hero_banner" })],
    });
    expect(r.ok && r.winner).toBeNull();
  });

  it("artwork creative accepts non-36:25 aspect", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [
        baseCandidate({
          id: "art",
          creative: {
            id: "cr-art",
            status: "ready",
            aspectW: 800,
            aspectH: 1000,
            creativeMode: "artwork",
          },
        }),
      ],
    });
    expect(r.ok && r.winner?.campaignId).toBe("art");
    if (r.ok && r.winner) expect(r.winner.creativeMode).toBe("artwork");
  });

  it("suppression UI does not always force TODAY", () => {
    const sessionOpts = resolvePlatformPopupPresentationSuppressionOptions({
      suppressionMode: "SESSION",
      frequencyMode: "once_per_session",
    });
    expect(sessionOpts).not.toContain("TODAY");

    const legacyOpts = resolvePlatformPopupPresentationSuppressionOptions({
      suppressionMode: "TODAY",
      frequencyMode: "close_only",
    });
    expect(legacyOpts).toContain("TODAY");
  });
});
