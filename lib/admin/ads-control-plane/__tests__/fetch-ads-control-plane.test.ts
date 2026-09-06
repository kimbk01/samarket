import { describe, expect, it } from "vitest";
import { parseAdsControlPlaneResponse } from "@/lib/admin/ads-control-plane/fetch-ads-control-plane";
import type { AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";

function minimalPlane(): AdsControlPlaneModel {
  return {
    generatedAt: "2026-09-07T00:00:00.000Z",
    actionRequired: [],
    queues: {
      delivery: { count: 0, unavailable: false, href: "/", source: "t" },
      feed: { count: 0, unavailable: false, href: "/", source: "t" },
      popup: { count: 0, unavailable: false, href: "/", source: "t" },
      tradePromote: { count: 0, unavailable: false, href: "/", source: "t" },
      communityPromote: { count: 0, unavailable: false, href: "/", source: "t" },
      collisionBlocking: { count: 0, unavailable: false, href: "/", source: "t" },
      collisionWarning: { count: 0, unavailable: false, href: "/", source: "t" },
      endingSoon: { count: 0, unavailable: false, href: "/", source: "t" },
      vacantSlots: { count: 0, unavailable: false, href: "/", source: "t" },
    },
    currentExecution: [],
    collisions: [],
    occupancy: [],
    applications: [],
    creatives: [],
    placements: [],
    billingNotes: [],
    domainEntries: [],
    recent: [],
    sectionErrors: [],
  };
}

describe("parseAdsControlPlaneResponse", () => {
  it("unwraps { ok, plane } envelope", () => {
    const plane = minimalPlane();
    const r = parseAdsControlPlaneResponse({ ok: true, plane }, true, 200);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plane.queues.delivery.href).toBe("/");
  });

  it("rejects treating envelope fields as the model", () => {
    const plane = minimalPlane();
    const r = parseAdsControlPlaneResponse({ ok: true, ...plane }, true, 200);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_plane_shape");
  });

  it("surfaces API errors", () => {
    const r = parseAdsControlPlaneResponse({ ok: false, error: "forbidden" }, false, 403);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("forbidden");
  });
});
