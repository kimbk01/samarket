import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SIDE_EFFECT_CHANNELS, evaluateSideEffectGate } from "@/lib/security/side-effect-gate";

const PROD_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const TEST_URL = "https://tcwnueuzuxftyomttdyu.supabase.co";

function env(over: Record<string, string | undefined>): NodeJS.ProcessEnv {
  // 게이트 자체 테스트: vitest 예외를 끄고 규칙 1~5 를 그대로 적용한다.
  return { SIDE_EFFECT_GATE_ENFORCE_IN_TESTS: "1", VITEST: "true", ...over } as NodeJS.ProcessEnv;
}

describe("side-effect gate — 운영 회귀 없음", () => {
  it("Vercel Production + 운영 DB → 모든 채널 허용 (현재 운영 env 형태: 배포 등급 변수 없음)", () => {
    for (const ch of SIDE_EFFECT_CHANNELS) {
      const d = evaluateSideEffectGate(ch, env({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD_URL }));
      expect(d.allowed, ch).toBe(true);
      expect(d.reason).toBe("production_verified");
    }
  });
});

describe("side-effect gate — 차단 규칙", () => {
  it("Production 배포인데 DB 가 운영이 아니거나 모르면 차단", () => {
    expect(evaluateSideEffectGate("cron", env({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: TEST_URL })).reason).toBe(
      "production_deploy_database_not_verified"
    );
    expect(evaluateSideEffectGate("cron", env({ VERCEL_ENV: "production" })).allowed).toBe(false);
  });
  it("비운영(Preview·local·명시 staging) + 운영 DB → 모든 채널 차단", () => {
    for (const tier of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { NEXT_PUBLIC_APP_DEPLOY_TIER: "staging" }]) {
      for (const ch of SIDE_EFFECT_CHANNELS) {
        const d = evaluateSideEffectGate(ch, env({ ...tier, NEXT_PUBLIC_SUPABASE_URL: PROD_URL }));
        expect(d.allowed, `${JSON.stringify(tier)} ${ch}`).toBe(false);
        expect(d.reason).toBe("non_production_deploy_production_database");
      }
    }
  });
  it("비운영 + DB 모름 → FAIL-CLOSED", () => {
    expect(evaluateSideEffectGate("sms_solapi", env({ VERCEL_ENV: "preview" })).reason).toBe(
      "non_production_deploy_unknown_database"
    );
    expect(
      evaluateSideEffectGate("sms_solapi", env({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://example.com" })).allowed
    ).toBe(false);
  });
  it("비운영 + 테스트 DB → 허용 목록에 없으면 차단, 있으면 허용", () => {
    const base = { NEXT_PUBLIC_APP_DEPLOY_TIER: "staging", NEXT_PUBLIC_SUPABASE_URL: TEST_URL };
    expect(evaluateSideEffectGate("email_resend", env(base)).reason).toBe("non_production_channel_not_allowlisted");
    expect(
      evaluateSideEffectGate("email_resend", env({ ...base, DIBAY_NONPROD_SIDE_EFFECT_ALLOW: "email_resend,cron" })).allowed
    ).toBe(true);
  });
  it("배포 등급을 production 으로 위장해도 DB 가 운영이 아니면 차단", () => {
    expect(
      evaluateSideEffectGate("webhook", env({ NEXT_PUBLIC_APP_DEPLOY_TIER: "production", NEXT_PUBLIC_SUPABASE_URL: TEST_URL }))
        .allowed
    ).toBe(false);
  });
});

describe("cron 계약 — vercel.json cron 20개는 게이트, 통화 관련 2개는 미변경", () => {
  const root = process.cwd();
  const crons = (JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as { crons: { path: string }[] }).crons;
  /**
   * 통화 규정(AGENTS 통화 1·3·4): 통화 정리 cron 과 부재중 통화 푸시를 싣는 push-handoff cron 은
   * 통화 단독 계획·승인 전 변경 금지 — 의도적 제외(보고서에 기재).
   */
  const CALL_DOMAIN_EXCLUDED = new Set([
    "/api/community-messenger/calls/sessions/stale-cleanup",
    "/api/cron/notification-push-handoff",
  ]);

  it("cron 수 = 22 (변경 시 이 계약을 함께 갱신 · 2026-11-10 messenger-contacts-maintenance 추가)", () => {
    expect(crons.length).toBe(22);
  });
  for (const c of crons) {
    it(`${c.path}`, () => {
      const file = path.join(root, "app", c.path, "route.ts");
      expect(existsSync(file)).toBe(true);
      const src = readFileSync(file, "utf8");
      if (CALL_DOMAIN_EXCLUDED.has(c.path)) {
        expect(src.includes("rejectCronIfSideEffectsBlocked")).toBe(false);
        return;
      }
      expect(src).toContain("rejectCronIfSideEffectsBlocked()");
      // 인증 확인 뒤에 게이트가 와야 한다(무인증 요청에 환경 정보를 노출하지 않음).
      expect(src.indexOf("verifyCronRequestAuthorization(req")).toBeLessThan(src.indexOf("rejectCronIfSideEffectsBlocked()"));
    });
  }
});

describe("통화 규정 — 푸시 발송 경로는 이 변경에서 손대지 않는다", () => {
  it("lib/push 분배·FCM·APNs·웹푸시 파일에 게이트가 없다", () => {
    for (const f of [
      "lib/push/dispatch/dispatch-push-for-user.ts",
      "lib/push/dispatch/fcm-http-v1-client.ts",
      "lib/push/dispatch/apns-sender.ts",
      "lib/push/dispatch/web-push-sender.ts",
    ]) {
      expect(readFileSync(path.join(process.cwd(), f), "utf8")).not.toContain("side-effect-gate");
    }
  });
});
