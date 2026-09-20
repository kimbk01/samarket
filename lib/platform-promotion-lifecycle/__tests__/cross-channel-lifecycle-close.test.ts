/**
 * Cross-channel lifecycle — pure contract + eligibility + source-path proofs.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractEventIdFromHref,
  extractEventIdFromPopupCta,
  isPromotionCoordinationChannel,
} from "@/lib/platform-promotion-lifecycle/content-visit-contract";
import { isPopupCandidateCoordinatedAway } from "@/lib/platform-promotion-lifecycle/content-visit-eligibility";
import { resolvePopupAd, type PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";

const ROOT = process.cwd();

function candidate(
  partial: Partial<PlatformPopupCandidate> & { id: string; eventId?: string }
): PlatformPopupCandidate {
  const eventId = partial.eventId;
  return {
    id: partial.id,
    status: "active",
    approvalStatus: "approved",
    priority: partial.priority ?? 10,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: ["GLOBAL"],
    presentationType: partial.presentationType ?? "center_modal",
    frequencyMode: "once_per_session",
    creative: {
      id: `cr-${partial.id}`,
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: "card",
      assetPath: `${partial.id}.webp`,
      assetUrl: `https://cdn.example/${partial.id}.webp`,
      altText: "Ad",
    },
    ctaType: eventId ? "event_detail" : "internal_page",
    ctaTarget: eventId ?? "/market",
    ctaLabel: "Go",
    title: `Title ${partial.id}`,
    body: `Body ${partial.id}`,
    suppressionMode: "SESSION",
    suppressions: [],
    lastImpressionAt: partial.lastImpressionAt ?? null,
    ctaLookup: eventId
      ? { exists: true, visible: true, authorized: true }
      : { exists: true, visible: true, authorized: true },
  };
}

describe("content-visit contract", () => {
  it("extracts event id from canonical href", () => {
    expect(extractEventIdFromHref("/events/evt-a")).toBe("evt-a");
    expect(extractEventIdFromHref("/events/evt-a?from=notifications")).toBe("evt-a");
    expect(extractEventIdFromHref("/market")).toBeNull();
  });

  it("channels: only POPUP|BANNER|PUSH|BELL coordinate", () => {
    expect(isPromotionCoordinationChannel("POPUP")).toBe(true);
    expect(isPromotionCoordinationChannel("BANNER")).toBe(true);
    expect(isPromotionCoordinationChannel("PUSH")).toBe(true);
    expect(isPromotionCoordinationChannel("BELL")).toBe(true);
    expect(isPromotionCoordinationChannel("DIRECT")).toBe(false);
  });

  it("popup CTA event_detail extracts event id", () => {
    expect(
      extractEventIdFromPopupCta({ ctaType: "event_detail", ctaTarget: "evt-1" })
    ).toBe("evt-1");
    expect(
      extractEventIdFromPopupCta({
        ctaType: "internal_page",
        ctaTarget: "/events/evt-2",
      })
    ).toBe("evt-2");
  });
});

describe("TEST MATRIX — channel entry + rotation", () => {
  it("A/B/D/F: coordinated Event A excludes popup A; Event B remains", () => {
    const a = candidate({ id: "p-a", eventId: "evt-a", lastImpressionAt: "2026-01-01T00:00:00.000Z" });
    const b = candidate({ id: "p-b", eventId: "evt-b", lastImpressionAt: null });
    const result = resolvePopupAd({
      pathname: "/",
      now: new Date("2026-06-01T00:00:00.000Z"),
      sessionKey: "sess-1",
      candidates: [a, b],
      coordinatedEventIds: new Set(["evt-a"]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.winner?.campaignId).toBe("p-b");
    }
  });

  it("G DIRECT: empty coordinated set leaves Event A eligible", () => {
    const a = candidate({ id: "p-a", eventId: "evt-a" });
    const result = resolvePopupAd({
      pathname: "/",
      now: new Date("2026-06-01T00:00:00.000Z"),
      sessionKey: "sess-1",
      candidates: [a],
      coordinatedEventIds: new Set(),
    });
    expect(result.ok && result.winner?.campaignId).toBe("p-a");
  });

  it("C/E: delivered/created alone = no coordination → A still eligible", () => {
    // No coordinatedEventIds write from delivered/created — empty set.
    const a = candidate({ id: "p-a", eventId: "evt-a" });
    expect(
      isPopupCandidateCoordinatedAway({
        ctaType: "event_detail",
        ctaTarget: "evt-a",
        coordinatedEventIds: [],
      })
    ).toBe(false);
    const result = resolvePopupAd({
      pathname: "/",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [a],
      coordinatedEventIds: [],
    });
    expect(result.ok && result.winner?.campaignId).toBe("p-a");
  });

  it("N/41: coordinate B → A/C/D still rotate among remaining", () => {
    const a = candidate({
      id: "p-a",
      eventId: "evt-a",
      lastImpressionAt: "2026-05-01T00:00:00.000Z",
    });
    const b = candidate({
      id: "p-b",
      eventId: "evt-b",
      lastImpressionAt: null,
    });
    const c = candidate({
      id: "p-c",
      eventId: "evt-c",
      lastImpressionAt: "2026-04-01T00:00:00.000Z",
    });
    const d = candidate({
      id: "p-d",
      eventId: "evt-d",
      lastImpressionAt: "2026-03-01T00:00:00.000Z",
    });
    const r1 = resolvePopupAd({
      pathname: "/",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [a, b, c, d],
      coordinatedEventIds: new Set(["evt-b"]),
    });
    expect(r1.ok && r1.winner?.campaignId).toBe("p-d"); // least-recently-shown among remaining
  });

  it("42 multi-distribution same Event: P1 and P2 both blocked after Event open", () => {
    const p1 = candidate({ id: "p1", eventId: "evt-a", lastImpressionAt: null });
    const p2 = candidate({
      id: "p2",
      eventId: "evt-a",
      lastImpressionAt: "2026-01-01T00:00:00.000Z",
    });
    const other = candidate({ id: "p-other", eventId: "evt-z", lastImpressionAt: "2026-02-01T00:00:00.000Z" });
    const result = resolvePopupAd({
      pathname: "/",
      now: new Date("2026-06-01T00:00:00.000Z"),
      candidates: [p1, p2, other],
      coordinatedEventIds: new Set(["evt-a"]),
    });
    expect(result.ok && result.winner?.campaignId).toBe("p-other");
  });
});

describe("source path proofs", () => {
  it("resolve route loads coordinated Event ids", () => {
    const src = readFileSync(join(ROOT, "app/api/platform-popup/resolve/route.ts"), "utf8");
    expect(src).toContain("loadSessionCoordinatedEventIds");
    expect(src).toContain("coordinatedEventIds");
  });

  it("Popup CTA / Banner / Push / Bell / reconcile hooks exist", () => {
    const host = readFileSync(join(ROOT, "components/platform-popup/GlobalPopupHost.tsx"), "utf8");
    expect(host).toContain('sourceChannel: "POPUP"');
    const hero = readFileSync(
      join(ROOT, "components/platform-events/EventPromotionHeroBanner.tsx"),
      "utf8"
    );
    expect(hero).toContain('sourceChannel: "BANNER"');
    const feed = readFileSync(join(ROOT, "components/ads/FeedAdBannerCarousel.tsx"), "utf8");
    expect(feed).toContain('sourceChannel: "BANNER"');
    const push = readFileSync(join(ROOT, "components/push/PushRouteListener.tsx"), "utf8");
    expect(push).toContain('sourceChannel: "PUSH"');
    const nav = readFileSync(
      join(ROOT, "lib/notifications/navigate-notification-destination.ts"),
      "utf8"
    );
    expect(nav).toContain('"BELL"');
    expect(nav).toContain("promotionOpenChannel");
    const auth = readFileSync(join(ROOT, "components/auth/SupabaseAuthSync.tsx"), "utf8");
    expect(auth).toContain("reconcileGuestPromotionLifecycleClient");
  });

  it("impression/delivered/created do not write content visits", () => {
    const host = readFileSync(join(ROOT, "components/platform-popup/GlobalPopupHost.tsx"), "utf8");
    // handleImpression path must not call content visit
    expect(host).not.toMatch(/handleImpression[\s\S]{0,400}recordPromotionContentVisitClient/);
    const delivery = readFileSync(
      join(ROOT, "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(delivery).toContain("useDeliveryAdImpressionObserver");
    expect(delivery).not.toMatch(/ImpressionObserver[\s\S]{0,200}recordPromotionContentVisit/);
  });
});
