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

  it("시스템 임시 닉네임 「DIBAY 사용자」 는 가입 완료 후에도 SNS 이름으로 교체 (Apple 첫 로그인 이름)", () => {
    expect(
      buildOAuthNicknamePatch(
        { onboarding_completed_at: "2026-11-07T00:00:00Z", nickname: "DIBAY 사용자", display_name: "DIBAY 사용자" },
        { nicknameCandidate: "BONGKI Kim" },
      ),
    ).toEqual({ nickname: "BONGKI Kim", display_name: "BONGKI Kim" });
  });

  it("회원이 디바이에서 바꾼 닉네임은 SNS 이름으로 덮어쓰지 않는다", () => {
    expect(
      shouldRefreshNicknameFromOAuth(
        { onboarding_completed_at: "2026-11-07T00:00:00Z", nickname: "봉기네", display_name: "봉기네" },
        "BONGKI Kim",
      ),
    ).toBe(false);
    expect(
      shouldRefreshNicknameFromOAuth({ onboarding_completed_at: null, nickname: "봉기네", display_name: "봉기네" }, "BONGKI Kim"),
    ).toBe(false);
  });

  it("후보가 임시 닉네임 자체면 교체하지 않는다", () => {
    expect(
      shouldRefreshNicknameFromOAuth({ onboarding_completed_at: null, nickname: "DIBAY 사용자", display_name: null }, "DIBAY 사용자"),
    ).toBe(false);
  });
});
