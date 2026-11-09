/**
 * 2026-11-09 Owner 결함 — 인증번호가 늦게 와서 화면을 나가면, 문자가 와도 입력할 곳이 없음.
 * 계약(G1): 서버는 아직 입력할 수 있는 인증번호(보낸 번호·만료·재발송 가능 시각)를 돌려준다.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPendingPhoneOtpChallengeForUser } from "@/lib/auth/phone-otp-service";

const NOW = Date.parse("2026-11-09T07:45:30.000Z");
const settings = { resend_cooldown_seconds: 60, max_attempts: 5 };

function fakeSb(rows: { challenge: Record<string, unknown> | null; profile: Record<string, unknown> | null }) {
  return {
    from(table: string) {
      const data = table === "phone_otp_challenges" ? rows.challenge : rows.profile;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const liveChallenge = {
  user_id: "u1",
  phone: "+639171234567",
  otp_code_hash: "x",
  otp_expires_at: "2026-11-09T07:50:23.000Z",
  attempt_count: 0,
  verified_at: null,
};
const profile = {
  phone_verification_requested_at: "2026-11-09T07:45:23.000Z",
  phone_verification_attempt_count: 0,
};

describe("G1 유효 인증번호 조회", () => {
  it("만료 전·미인증 → 보낸 번호·만료·재발송 가능 시각(보낸 시각 + 60초)", async () => {
    const r = await loadPendingPhoneOtpChallengeForUser(fakeSb({ challenge: liveChallenge, profile }), "u1", settings, NOW);
    expect(r).toEqual({
      phone: "+639171234567",
      expires_at: "2026-11-09T07:50:23.000Z",
      resend_available_at: "2026-11-09T07:46:23.000Z",
    });
  });

  it("만료됨 → null (새로 보내야 함)", async () => {
    const r = await loadPendingPhoneOtpChallengeForUser(
      fakeSb({ challenge: { ...liveChallenge, otp_expires_at: "2026-11-09T07:45:00.000Z" }, profile }),
      "u1",
      settings,
      NOW,
    );
    expect(r).toBeNull();
  });

  it("이미 인증 완료 → null", async () => {
    const r = await loadPendingPhoneOtpChallengeForUser(
      fakeSb({ challenge: { ...liveChallenge, verified_at: "2026-11-09T07:46:00.000Z" }, profile }),
      "u1",
      settings,
      NOW,
    );
    expect(r).toBeNull();
  });

  it("시도 횟수 초과 → null", async () => {
    const r = await loadPendingPhoneOtpChallengeForUser(
      fakeSb({ challenge: { ...liveChallenge, attempt_count: 5 }, profile }),
      "u1",
      settings,
      NOW,
    );
    expect(r).toBeNull();
  });

  it("기록 없음 → null", async () => {
    expect(await loadPendingPhoneOtpChallengeForUser(fakeSb({ challenge: null, profile }), "u1", settings, NOW)).toBeNull();
  });
});
