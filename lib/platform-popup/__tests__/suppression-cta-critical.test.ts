import { describe, expect, it } from "vitest";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import {
  assertNotImpressionFromResolver,
  canEmitPlatformPopupEventFromSource,
} from "@/lib/platform-popup/events";
import { resolvePopupAd, type PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import {
  assertTodayIsNotRolling24h,
  computePlatformPopupSuppressUntil,
  isPlatformPopupSuppressionActive,
  platformPopupLocalDayEndExclusive,
} from "@/lib/platform-popup/suppression";

function cand(
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

describe("platform popup suppression — CUT 1", () => {
  it("SESSION suppresses only matching session key", () => {
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "SESSION", sessionKey: "s1" },
        { now: new Date(), currentSessionKey: "s1" }
      )
    ).toBe(true);
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "SESSION", sessionKey: "s1" },
        { now: new Date(), currentSessionKey: "s2" }
      )
    ).toBe(false);
  });

  it("TODAY uses calendar-day end, not now+24h", () => {
    // 2026-06-01 20:00 Manila = 2026-06-01 12:00 UTC
    const now = new Date("2026-06-01T12:00:00.000Z");
    const until = computePlatformPopupSuppressUntil("TODAY", {
      now,
      timezone: "Asia/Manila",
    });
    expect(until).not.toBeNull();
    expect(assertTodayIsNotRolling24h(until!, now, "Asia/Manila")).toBe(true);
    const dayEnd = platformPopupLocalDayEndExclusive(now, "Asia/Manila");
    expect(until!.getTime()).toBe(dayEnd.getTime());
    // Still active before day end
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "TODAY", suppressUntil: until!.toISOString(), timezone: "Asia/Manila" },
        { now: new Date("2026-06-01T15:00:00.000Z"), timezone: "Asia/Manila" }
      )
    ).toBe(true);
    // Expired after local midnight
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "TODAY", suppressUntil: until!.toISOString(), timezone: "Asia/Manila" },
        { now: new Date("2026-06-01T16:00:01.000Z"), timezone: "Asia/Manila" }
      )
    ).toBe(false);
  });

  it("DURATION uses suppress_until", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const until = computePlatformPopupSuppressUntil("DURATION", {
      now,
      durationSeconds: 3600,
    });
    expect(until!.getTime()).toBe(now.getTime() + 3600_000);
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "DURATION", suppressUntil: until!.toISOString() },
        { now: new Date("2026-06-01T00:30:00.000Z") }
      )
    ).toBe(true);
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "DURATION", suppressUntil: until!.toISOString() },
        { now: new Date("2026-06-01T01:00:01.000Z") }
      )
    ).toBe(false);
  });

  it("CAMPAIGN suppresses while revision matches / unset", () => {
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "CAMPAIGN", campaignRevision: "rev1" },
        { now: new Date(), currentCampaignRevision: "rev1" }
      )
    ).toBe(true);
    expect(
      isPlatformPopupSuppressionActive(
        { mode: "CAMPAIGN", campaignRevision: "rev1" },
        { now: new Date(), currentCampaignRevision: "rev2" }
      )
    ).toBe(false);
  });

  it("expired suppression does not block resolvePopupAd", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const r = resolvePopupAd({
      pathname: "/market",
      now,
      candidates: [
        cand({
          id: "c1",
          suppressions: [
            {
              mode: "DURATION",
              suppressUntil: "2026-05-01T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    expect(r.ok && r.winner?.campaignId).toBe("c1");
  });
});

describe("platform popup CTA fail-closed — CUT 1", () => {
  it("valid internal", () => {
    const r = validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: "/market" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.href).toBe("/market");
  });

  it("invalid target fail closed", () => {
    expect(validatePlatformPopupCta({ ctaType: "trade_listing", ctaTarget: "" }).ok).toBe(false);
    expect(
      validatePlatformPopupCta(
        { ctaType: "trade_listing", ctaTarget: "p1" },
        { exists: false, visible: true }
      ).ok
    ).toBe(false);
  });

  it("store CTA without lookup is structural-ok (entity gate deferred)", () => {
    const r = validatePlatformPopupCta({ ctaType: "store", ctaTarget: "s1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.href).toBe("/stores/s1");
  });

  it("unauthorized target fail closed", () => {
    expect(
      validatePlatformPopupCta(
        { ctaType: "store", ctaTarget: "s1" },
        { exists: true, visible: true, authorized: false }
      ).ok
    ).toBe(false);
  });

  it("external URL allow-policy (https only)", () => {
    expect(
      validatePlatformPopupCta({
        ctaType: "external_url",
        externalUrl: "https://example.com/x",
      }).ok
    ).toBe(true);
    expect(
      validatePlatformPopupCta({
        ctaType: "external_url",
        externalUrl: "http://example.com/x",
      }).ok
    ).toBe(false);
    expect(
      validatePlatformPopupCta({
        ctaType: "external_url",
        externalUrl: "javascript:alert(1)",
      }).ok
    ).toBe(false);
  });
});

describe("platform popup critical UI + call priority — CUT 1", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const eligible = [cand({ id: "c1" })];

  it("incoming call → popup ineligible/deferred", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now,
      criticalUi: { callIncoming: true },
      candidates: eligible,
    });
    expect(r.ok && r.winner).toBeNull();
    if (r.ok) expect(r.reason).toBe("critical_ui_deferred");
  });

  it("active call → popup ineligible/deferred", () => {
    const r = resolvePopupAd({
      pathname: "/philife",
      now,
      criticalUi: { callActive: true },
      candidates: eligible,
    });
    expect(r.ok && r.winner).toBeNull();
  });

  it("payment/order critical → popup ineligible/deferred", () => {
    expect(
      resolvePopupAd({
        pathname: "/stores",
        now,
        criticalUi: { paymentCritical: true },
        candidates: eligible,
      }).ok &&
        resolvePopupAd({
          pathname: "/stores",
          now,
          criticalUi: { paymentCritical: true },
          candidates: eligible,
        }).ok
    ).toBe(true);
    const pay = resolvePopupAd({
      pathname: "/stores",
      now,
      criticalUi: { paymentCritical: true },
      candidates: eligible,
    });
    expect(pay.ok && pay.winner).toBeNull();
    const order = resolvePopupAd({
      pathname: "/stores",
      now,
      criticalUi: { orderSubmitCritical: true },
      candidates: eligible,
    });
    expect(order.ok && order.winner).toBeNull();
  });
});

describe("platform popup events — impression blocked from resolver", () => {
  it("API_RESPONSE_AS_IMPRESSION blocked", () => {
    expect(assertNotImpressionFromResolver("impression", "resolver").ok).toBe(false);
    expect(assertNotImpressionFromResolver("impression", "api_eligibility").ok).toBe(false);
    expect(assertNotImpressionFromResolver("impression", "renderer").ok).toBe(true);
    expect(canEmitPlatformPopupEventFromSource("impression", "resolver")).toBe(false);
    expect(canEmitPlatformPopupEventFromSource("eligible", "resolver")).toBe(true);
  });
});
