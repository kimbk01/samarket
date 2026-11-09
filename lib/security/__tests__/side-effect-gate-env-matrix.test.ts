import { describe, expect, it } from "vitest";
import { evaluateSideEffectGate } from "@/lib/security/side-effect-gate";

/**
 * 운영 판정 환경 변형 매트릭스 — 운영 정상 경로는 허용, 판정이 흔들리는 조합은 차단(FAIL-CLOSED)임을 고정.
 * 기준 운영 런타임(2026-11-09 운영 /api/admin/deploy/status 읽기): deployTier=production, databaseTarget=production,
 * projectRef=ckdosyydvgzqwpbwuhon — 이 게이트와 같은 판정 함수.
 */
const PROD = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const e = (over: Record<string, string | undefined>) =>
  ({ SIDE_EFFECT_GATE_ENFORCE_IN_TESTS: "1", VITEST: "true", ...over }) as NodeJS.ProcessEnv;

describe("운영 정상 경로 — 허용", () => {
  const cases: [string, Record<string, string | undefined>][] = [
    ["운영 현재 형태(VERCEL_ENV=production, 등급 변수 없음)", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD }],
    ["등급 변수 production 명시", { NEXT_PUBLIC_APP_DEPLOY_TIER: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD }],
    ["URL 끝 슬래시", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: `${PROD}/` }],
    ["추가 운영 ref 목록 존재(운영 ref 는 빠질 수 없음)", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD, DATA_RESET_PRODUCTION_SUPABASE_REFS: "other1234567890abcdef" }],
    ["SMS·메일 자격증명 교체(값으로 판정하지 않음)", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD, SOLAPI_API_KEY: "new", RESEND_API_KEY: "new" }],
  ];
  for (const [name, env] of cases) {
    it(name, () => {
      for (const ch of ["sms_semaphore", "sms_solapi", "email_resend", "webhook", "google_routes", "cron"] as const) {
        expect(evaluateSideEffectGate(ch, e(env)).allowed, `${name} ${ch}`).toBe(true);
      }
    });
  }
});

describe("판정이 흔들리는 조합 — 차단(운영 env 가 이렇게 바뀌면 SMS·메일·cron 이 멈춘다 → 배포 후 확인 대상)", () => {
  const cases: [string, Record<string, string | undefined>, string][] = [
    ["URL 누락", { VERCEL_ENV: "production" }, "production_deploy_database_not_verified"],
    ["커스텀 도메인 URL", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://api.dibay.app" }, "production_deploy_database_not_verified"],
    ["잘못된 DB(테스트 프로젝트)", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://tcwnueuzuxftyomttdyu.supabase.co" }, "production_deploy_database_not_verified"],
    ["파싱 불가 URL", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "not a url" }, "production_deploy_database_not_verified"],
    ["운영에 staging 등급 변수가 잘못 들어감", { VERCEL_ENV: "production", NEXT_PUBLIC_APP_DEPLOY_TIER: "staging", NEXT_PUBLIC_SUPABASE_URL: PROD }, "non_production_deploy_production_database"],
    ["Preview + 운영 DB", { VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: PROD }, "non_production_deploy_production_database"],
    ["로컬 개발 + 운영 DB", { VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: PROD }, "non_production_deploy_production_database"],
  ];
  for (const [name, env, reason] of cases) {
    it(name, () => {
      const d = evaluateSideEffectGate("sms_solapi", e(env));
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe(reason);
    });
  }
});
