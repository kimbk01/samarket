import { describe, expect, it } from "vitest";
import { clampTrustScore, TRUST_SCORE_DEFAULT } from "@/lib/trust/trust-score-core";
import {
  resolveMemberTrustDisplayScore,
  resolveTrustScoreAuthority,
} from "@/lib/trust/trust-score-ssot";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import type { ProfileRow } from "@/lib/profile/types";

describe("Slice1 Trust SSOT", () => {
  it("authority prefers trust_score over manner_score", () => {
    expect(resolveTrustScoreAuthority({ trust_score: 72, manner_score: 40 })).toBe(72);
    expect(resolveTrustScoreAuthority({ trust_score: null, manner_score: 40 })).toBe(40);
    expect(resolveTrustScoreAuthority({})).toBe(TRUST_SCORE_DEFAULT);
  });

  it("member display ignores stale temperature when trust_score present", () => {
    expect(
      resolveMemberTrustDisplayScore({
        trust_score: 61,
        temperature: 99,
      }),
    ).toBe(61);
  });

  it("profileRowToClientProfile temperature projects trust_score", () => {
    const row = {
      id: "u1",
      trust_score: 66,
      manner_score: 10,
      nickname: "n",
      display_name: "n",
    } as ProfileRow;
    const p = profileRowToClientProfile(row);
    expect(p.temperature).toBe(66);
    expect(p.trust_score).toBe(66);
  });

  it("clamp keeps 0–100", () => {
    expect(clampTrustScore(-5)).toBe(0);
    expect(clampTrustScore(150)).toBe(100);
  });
});
