import { describe, expect, it } from "vitest";
import { buildMemberTrustSurface } from "@/lib/trust/member-trust-surface";
import { DESIGN_SYSTEM_BRAND } from "@/lib/ui/design-system-hard-lock";
import { MANNER_BATTERY_TIER_COLORS } from "@/lib/trust/manner-battery";

describe("Slice4 member trust surface parity", () => {
  it("home and trust page resolve the same score/percent/tier from trust_score", () => {
    const surface = buildMemberTrustSurface({
      trust_score: 72,
      manner_score: 10,
      temperature: 99,
    });
    expect(surface.score).toBe(72);
    expect(surface.percent).toBe(72);
    expect(surface.scoreLabel).toBe("72");
    expect(surface.percentLabel).toBe("72%");
    expect(surface.tier).toBeGreaterThanOrEqual(1);
  });

  it("top battery tier uses DIBAY green HARD LOCK hex", () => {
    expect(MANNER_BATTERY_TIER_COLORS[6]).toBe(DESIGN_SYSTEM_BRAND.primaryHex);
  });
});
