import { describe, expect, it } from "vitest";
import {
  buildOAuthNicknamePatch,
  shouldRefreshNicknameFromOAuth,
} from "@/lib/auth/refresh-oauth-nickname-if-legacy";

describe("refresh-oauth-nickname-if-legacy", () => {
  it("refreshes when signup incomplete and nickname is auto dibay_*", () => {
    expect(
      shouldRefreshNicknameFromOAuth(
        { onboarding_completed_at: null, nickname: "dibay_a1b2c3", display_name: "dibay_a1b2c3" },
        "Kim BK"
      )
    ).toBe(true);
  });

  it("skips when signup is complete", () => {
    expect(
      shouldRefreshNicknameFromOAuth(
        {
          onboarding_completed_at: "2026-01-01T00:00:00Z",
          nickname: "dibay_a1b2c3",
          display_name: "dibay_a1b2c3",
        },
        "Kim BK"
      )
    ).toBe(false);
  });

  it("skips when user-chosen nickname exists", () => {
    expect(
      shouldRefreshNicknameFromOAuth(
        { onboarding_completed_at: null, nickname: "boss_market", display_name: "Boss" },
        "Kim BK"
      )
    ).toBe(false);
  });

  it("builds patch for legacy auto nickname", () => {
    expect(
      buildOAuthNicknamePatch(
        { onboarding_completed_at: null, nickname: "dibay_000000", display_name: null },
        { nicknameCandidate: "Google User" }
      )
    ).toEqual({ nickname: "Google User", display_name: "Google User" });
  });

  it("returns null when candidate missing", () => {
    expect(
      buildOAuthNicknamePatch(
        { onboarding_completed_at: null, nickname: "dibay_000000", display_name: null },
        { nicknameCandidate: null }
      )
    ).toBeNull();
  });
});
