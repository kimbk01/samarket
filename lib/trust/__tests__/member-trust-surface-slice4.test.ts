import { describe, expect, it } from "vitest";
import { buildMemberTrustSurface } from "@/lib/trust/member-trust-surface";
import { DESIGN_SYSTEM_BRAND } from "@/lib/ui/design-system-hard-lock";
import { buildCrewRepView, CREW_REP_TIERS, crewRepTier } from "@/lib/trust/crew-rep";

describe("Slice4 member trust surface parity (CREW REP)", () => {
  it("home and trust page resolve the same score/tier from trust_score", () => {
    const surface = buildMemberTrustSurface({
      trust_score: 72,
      manner_score: 10,
      temperature: 99,
    });
    expect(surface.rawScore).toBe(72);
    expect(surface.view.score).toBe(72);
    expect(surface.view.tier).toBe(4);
    expect(surface.view.labelKey).toBe("crew_rep_tier_4");
  });

  it("display score is an integer out of 100 (no % / no decimals)", () => {
    const surface = buildMemberTrustSurface({ trust_score: 68.22 });
    expect(surface.rawScore).toBe(68.22);
    expect(surface.view.score).toBe(68);
  });

  it("tier bands: 0–19 · 20–39 · 40–59 · 60–74 · 75–89 · 90–100", () => {
    expect([0, 19, 20, 39, 40, 50, 59, 60, 74, 75, 89, 90, 100].map(crewRepTier)).toEqual([
      1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    expect(CREW_REP_TIERS.map((t) => [t.min, t.max])).toEqual([
      [0, 19],
      [20, 39],
      [40, 59],
      [60, 74],
      [75, 89],
      [90, 100],
    ]);
  });

  it("new member 50 is Neutral grey, not a warning colour", () => {
    const v = buildCrewRepView(50);
    expect(v.labelKey).toBe("crew_rep_tier_3");
    expect(v.color).toBe("#8A94A0");
  });

  it("top tier uses DIBAY green HARD LOCK hex", () => {
    expect(CREW_REP_TIERS[5]!.color).toBe(DESIGN_SYSTEM_BRAND.primaryHex);
  });
});
