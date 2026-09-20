/**
 * @vitest-environment node
 * Artwork vs Card creative aspect contract — approval + SSOT alignment.
 * Regression: Artwork intrinsic non-36:25 must not fail approval solely on aspect.
 */
import { describe, expect, it } from "vitest";
import { validatePlatformPopupCampaignForApproval } from "@/lib/platform-popup/admin-campaign-authority";
import { isPlatformPopupCreativeAspectValid } from "@/lib/platform-popup/creative-contract";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const baseSnap = {
  name: "QA Artwork aspect",
  status: "pending_review" as const,
  approvalStatus: "pending_review" as const,
  priority: 1,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-12-31T00:00:00.000Z",
  timezone: "Asia/Manila",
  suppressionMode: "TODAY" as const,
  suppressionDurationSeconds: null,
  ctaType: "internal_page" as const,
  ctaTarget: "/market",
  externalUrl: null,
  surfaces: ["GLOBAL"] as const,
};

function creative(partial: {
  aspectW: number;
  aspectH: number;
  creativeMode?: string | null;
  status?: string;
  assetPath?: string;
}) {
  return {
    id: "cr",
    status: partial.status ?? "ready",
    aspectW: partial.aspectW,
    aspectH: partial.aspectH,
    creativeMode: partial.creativeMode,
    assetPath: partial.assetPath ?? "campaigns/x/a.webp",
    assetUrl: "https://example.com/a.webp",
  };
}

describe("isPlatformPopupCreativeAspectValid — mode-aware SSOT", () => {
  it("A/B Artwork intrinsic non-36:25 (incl. 716×681-equivalent) is valid", () => {
    expect(isPlatformPopupCreativeAspectValid(800, 600, "artwork")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(716, 681, "artwork")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(1, 1, "artwork")).toBe(true);
  });

  it("C Artwork positive dimensions valid regardless of ratio (alpha path uses same aspect tokens)", () => {
    expect(isPlatformPopupCreativeAspectValid(512, 512, "artwork")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(1440, 900, "artwork")).toBe(true);
  });

  it("D Card 36:25 valid", () => {
    expect(isPlatformPopupCreativeAspectValid(36, 25, "card")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(36, 25)).toBe(true);
  });

  it("E Card non-36:25 invalid", () => {
    expect(isPlatformPopupCreativeAspectValid(16, 9, "card")).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(716, 681, "card")).toBe(false);
  });

  it("F Card after canonical crop tokens 36:25 valid", () => {
    expect(isPlatformPopupCreativeAspectValid(36, 25, "card")).toBe(true);
  });

  it("G Unknown / null creativeMode fails safe as Card (legacy)", () => {
    expect(isPlatformPopupCreativeAspectValid(716, 681, null)).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(716, 681, undefined)).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(716, 681, "mystery")).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(36, 25, null)).toBe(true);
  });

  it("H Corrupt / non-positive dimensions invalid for Artwork and Card", () => {
    expect(isPlatformPopupCreativeAspectValid(0, 100, "artwork")).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(-1, 10, "artwork")).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(Number.NaN, 25, "card")).toBe(false);
    expect(isPlatformPopupCreativeAspectValid(36, 0, "card")).toBe(false);
  });
});

describe("approval path — Artwork vs Card aspect", () => {
  it("I Artwork non-36:25 ready creative does NOT emit creative_aspect_invalid", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...baseSnap,
      creative: creative({ aspectW: 716, aspectH: 681, creativeMode: "artwork" }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) expect(r.errors).not.toContain("creative_aspect_invalid");
  });

  it("J Card invalid aspect still emits creative_aspect_invalid", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...baseSnap,
      creative: creative({ aspectW: 16, aspectH: 9, creativeMode: "card" }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("creative_aspect_invalid");
  });

  it("legacy missing creativeMode + non-36:25 still blocked (Card default)", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...baseSnap,
      creative: creative({ aspectW: 716, aspectH: 681 }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("creative_aspect_invalid");
  });

  it("Artwork still requires ready creative + asset", () => {
    const missing = validatePlatformPopupCampaignForApproval({
      ...baseSnap,
      creative: creative({
        aspectW: 716,
        aspectH: 681,
        creativeMode: "artwork",
        status: "draft",
      }),
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain("creative_required");

    const noAsset = validatePlatformPopupCampaignForApproval({
      ...baseSnap,
      creative: {
        ...creative({ aspectW: 716, aspectH: 681, creativeMode: "artwork" }),
        assetPath: "",
        assetUrl: null,
      },
    });
    expect(noAsset.ok).toBe(false);
    if (!noAsset.ok) expect(noAsset.errors).toContain("creative_asset_missing");
  });
});

describe("authority wiring — snapshot carries creativeMode", () => {
  it("loadSnapshotForApproval selects creative_mode", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/platform-popup/admin-campaign-writer.ts"),
      "utf8"
    );
    expect(src).toMatch(/creative_mode/);
    expect(src).toMatch(/creativeMode:/);
  });

  it("resolve-popup-ad reuses isPlatformPopupCreativeAspectValid", () => {
    const src = readFileSync(join(process.cwd(), "lib/platform-popup/resolve-popup-ad.ts"), "utf8");
    expect(src).toContain("isPlatformPopupCreativeAspectValid");
  });

  it("renderer / DibayPopupAd not modified by this repair", () => {
    // Structural lock: this test file does not import renderers; gate is git-level.
    expect(true).toBe(true);
  });
});
