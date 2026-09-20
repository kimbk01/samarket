/**
 * @vitest-environment node
 * Presentation Admin → Save → Resolve roundtrip + rotation proof.
 */
import { describe, expect, it } from "vitest";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import { resolvePlatformPopupComposition } from "@/lib/platform-popup/resolve-presentation-composition";
import { comparePopupCandidatesForRotation } from "@/lib/platform-popup/popup-rotation";
import { resolvePopupAd } from "@/lib/platform-popup/resolve-popup-ad";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function candidate(
  partial: Partial<PlatformPopupCandidate> & { id: string }
): PlatformPopupCandidate {
  return {
    id: partial.id,
    status: "active",
    approvalStatus: "approved",
    priority: partial.priority ?? 10,
    startAt: partial.startAt ?? "2026-01-01T00:00:00.000Z",
    endAt: partial.endAt ?? "2026-12-31T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: partial.surfaces ?? ["GLOBAL"],
    presentationType: partial.presentationType ?? "center_modal",
    frequencyMode: partial.frequencyMode ?? "once_per_session",
    creative: partial.creative ?? {
      id: `cr-${partial.id}`,
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: "card",
      assetPath: `campaigns/${partial.id}/a.webp`,
      assetUrl: `https://cdn.example/${partial.id}.webp`,
      altText: "Ad",
    },
    ctaType: "internal_page",
    ctaTarget: "/market",
    externalUrl: null,
    ctaLabel: partial.ctaLabel ?? "Go",
    title: partial.title ?? `Title ${partial.id}`,
    body: partial.body ?? `Body ${partial.id}`,
    suppressionMode: "SESSION",
    suppressionDurationSeconds: null,
    ctaLookup: { exists: true, visible: true, authorized: true },
    suppressions: [],
    lastImpressionAt: partial.lastImpressionAt ?? null,
  };
}

describe("Presentation A–D roundtrip + rotation", () => {
  it("composition switches A/B/C/D from presentation+creativeMode", () => {
    expect(
      resolvePlatformPopupComposition({
        presentationType: "center_modal",
        creativeMode: "artwork",
      })
    ).toBe("artwork_modal");
    expect(
      resolvePlatformPopupComposition({
        presentationType: "center_modal",
        creativeMode: "card",
      })
    ).toBe("promotion_card_modal");
    expect(
      resolvePlatformPopupComposition({
        presentationType: "bottom_sheet",
        creativeMode: "card",
      })
    ).toBe("bottom_promotion_sheet");
    expect(
      resolvePlatformPopupComposition({
        presentationType: "benefit_dialog",
        creativeMode: "card",
      })
    ).toBe("benefit_dialog");
  });

  it("buildPresentationWinner preserves title/body/ctaLabel (Save→Resolve content)", () => {
    const c = candidate({
      id: "a",
      presentationType: "center_modal",
      creative: {
        id: "cr-a",
        status: "ready",
        aspectW: 36,
        aspectH: 25,
        creativeMode: "artwork",
        assetPath: "x.webp",
        assetUrl: "https://cdn.example/x.webp",
        altText: "alt",
      },
      title: "2,000 won off",
      body: "Order now",
      ctaLabel: "Receive Benefit",
    });
    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: c.id,
        creativeId: c.creative!.id,
        surface: "TRADE",
        href: "/market",
        presentationType: "center_modal",
        frequencyMode: "once_per_session",
        creativeMode: "artwork",
      },
      c,
      {
        assetUrl: c.creative!.assetUrl,
        assetPath: c.creative!.assetPath,
        altText: c.creative!.altText,
      },
      {
        suppressionMode: "SESSION",
        suppressionDurationSeconds: null,
        timezone: "Asia/Manila",
        ctaLabel: c.ctaLabel,
        title: c.title,
        body: c.body,
        frequencyMode: "once_per_session",
      }
    );
    expect(presentation?.title).toBe("2,000 won off");
    expect(presentation?.body).toBe("Order now");
    expect(presentation?.cta.label).toBe("Receive Benefit");
    expect(presentation?.creative.creativeMode).toBe("artwork");
  });

  it("Admin Save persists creativeMode in writer PATCH body contract", () => {
    const workspace = readFileSync(
      join(ROOT, "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx"),
      "utf8"
    );
    expect(workspace).toContain("creativeMode");
    expect(workspace).toContain("ctaLabel");
    expect(workspace).toContain("promoTitle");
    expect(workspace).toContain("promoBody");
    const writer = readFileSync(join(ROOT, "lib/platform-popup/admin-campaign-writer.ts"), "utf8");
    expect(writer).toContain("creative_mode");
    expect(writer).toContain("cta_label");
    expect(writer).toContain("patch.title");
    const resolve = readFileSync(join(ROOT, "app/api/platform-popup/resolve/route.ts"), "utf8");
    expect(resolve).not.toMatch(/ctaLabel:\s*null/);
    expect(resolve).toContain("candidate.ctaLabel");
  });

  it("rotation: least-recently-shown — SAME WINNER FOREVER = NO", () => {
    const a = candidate({
      id: "camp-a",
      priority: 10,
      presentationType: "center_modal",
      lastImpressionAt: "2026-06-01T00:00:00.000Z",
    });
    const b = candidate({
      id: "camp-b",
      priority: 10,
      presentationType: "center_modal",
      creative: {
        id: "cr-b",
        status: "ready",
        aspectW: 36,
        aspectH: 25,
        creativeMode: "card",
        assetPath: "b.webp",
        assetUrl: "https://cdn.example/b.webp",
        altText: "B",
      },
      lastImpressionAt: null,
    });
    const c = candidate({
      id: "camp-c",
      priority: 5,
      presentationType: "bottom_sheet",
      lastImpressionAt: "2026-05-01T00:00:00.000Z",
    });
    const d = candidate({
      id: "camp-d",
      priority: 5,
      presentationType: "benefit_dialog",
      lastImpressionAt: "2026-07-01T00:00:00.000Z",
    });

    const sorted = [a, b, c, d].slice().sort(comparePopupCandidatesForRotation);
    // never shown (b) first
    expect(sorted[0].id).toBe("camp-b");

    const r1 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T00:00:00.000Z"),
      sessionKey: "s1",
      candidates: [a, b, c, d],
    });
    expect(r1.ok && r1.winner?.campaignId).toBe("camp-b");

    // After B shown, next should not permanently stick on B
    const afterB = [
      { ...a },
      { ...b, lastImpressionAt: "2026-08-01T00:00:00.000Z" },
      { ...c },
      { ...d },
    ];
    const r2 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T01:00:00.000Z"),
      sessionKey: "s2",
      candidates: afterB,
    });
    expect(r2.ok && r2.winner?.campaignId).not.toBe("camp-b");
    // oldest remaining impression among A/C/D is C (May)
    expect(r2.ok && r2.winner?.campaignId).toBe("camp-c");

    const afterC = afterB.map((x) =>
      x.id === "camp-c" ? { ...x, lastImpressionAt: "2026-08-01T01:00:00.000Z" } : x
    );
    const r3 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T02:00:00.000Z"),
      sessionKey: "s3",
      candidates: afterC,
    });
    expect(r3.ok && r3.winner?.campaignId).toBe("camp-a");

    const afterA = afterC.map((x) =>
      x.id === "camp-a" ? { ...x, lastImpressionAt: "2026-08-01T02:00:00.000Z" } : x
    );
    const r4 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T03:00:00.000Z"),
      sessionKey: "s4",
      candidates: afterA,
    });
    expect(r4.ok && r4.winner?.campaignId).toBe("camp-d");

    const winners = [
      r1.ok && r1.winner?.campaignId,
      r2.ok && r2.winner?.campaignId,
      r3.ok && r3.winner?.campaignId,
      r4.ok && r4.winner?.campaignId,
    ];
    expect(new Set(winners).size).toBe(4);
  });

  it("preview uses DibayPopupAd not a fake Admin renderer", () => {
    const preview = readFileSync(
      join(ROOT, "components/admin/platform-popup/AdminPlatformPopupPreview.tsx"),
      "utf8"
    );
    expect(preview).toContain('from "@/components/platform-popup/DibayPopupAd"');
    expect(preview).toContain("title={winner.title}");
    expect(preview).toContain("label: source.ctaLabel");
  });
});
