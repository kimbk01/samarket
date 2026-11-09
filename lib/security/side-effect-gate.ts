/**
 * 외부 부작용 게이트 (P0-A · Owner 「4단계 A — 비운영 환경 부작용 차단」 2026-11-09).
 *
 * 실제 외부 호출(SMS·이메일·웹훅·유료 외부 API)·cron 직전에 **서버에서** 판정한다.
 *
 * 범위 밖(통화 규정 — AGENTS 「통화 변경 규정」 1·3·4): 푸시 발송 경로(`lib/push/**` 분배·FCM·APNs·웹푸시·VoIP)와
 * 통화 정리 cron·부재중 푸시를 싣는 `notification-push-handoff` cron 은 이 게이트를 연결하지 않는다.
 * 그 경로의 비운영 차단은 통화 단독 계획·Owner 승인 후 별도 단독 커밋으로만 한다.
 * 화면 버튼 비활성화는 차단으로 보지 않는다.
 *
 * 허용 규칙 (FAIL-CLOSED):
 * 1. 배포 = Production **그리고** DB = 허용된 운영 프로젝트(`DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS`) → 허용.
 * 2. 배포 = Production 인데 DB 가 운영이 아니거나 모르면 → 차단(잘못 연결된 Production).
 * 3. 비운영 배포 + 운영 DB → 차단(운영 사용자 대상 부작용 금지).
 * 4. 비운영 배포 + DB 모름 → 차단(식별 불명 = FAIL-CLOSED).
 * 5. 비운영 배포 + 비운영 DB → 채널이 `DIBAY_NONPROD_SIDE_EFFECT_ALLOW`(쉼표 목록)에 **명시**된 경우만 허용.
 *    (SMS·메일·웹훅 자격증명은 값으로 운영 여부를 판별할 수 없어 「명시 허용 외 기본 차단」으로 대신한다.)
 * 6. vitest 실행기: 기존 단위 테스트 보존을 위해 허용 — 단 `SIDE_EFFECT_GATE_ENFORCE_IN_TESTS=1` 이면 규칙 1~5 적용
 *    (이 게이트 자체의 테스트용). Vercel 배포에서는 VITEST 가 설정되지 않는다.
 *
 * 기존 `evaluateSideEffectDispatchGate`(런타임 배너·관리자 배포 게이트용)는 의미를 바꾸지 않는다.
 */

import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";
import { resolveServerDeployTier } from "@/lib/config/test-production-isolation";
import type { AppDeployTier } from "@/lib/config/deploy-surface";

export type SideEffectChannel =
  | "sms_semaphore"
  | "sms_solapi"
  | "email_resend"
  | "webhook"
  | "google_routes"
  | "cron";

export const SIDE_EFFECT_CHANNELS: readonly SideEffectChannel[] = [
  "sms_semaphore",
  "sms_solapi",
  "email_resend",
  "webhook",
  "google_routes",
  "cron",
];

export type SideEffectGateDecision = {
  allowed: boolean;
  channel: SideEffectChannel;
  reason: string;
  deployTier: AppDeployTier;
  databaseTarget: "production" | "non_production" | "unknown";
};

function isVitestRunner(env: NodeJS.ProcessEnv): boolean {
  return env.VITEST === "true" || env.NODE_ENV === "test";
}

function nonProdAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.DIBAY_NONPROD_SIDE_EFFECT_ALLOW ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function evaluateSideEffectGate(
  channel: SideEffectChannel,
  env: NodeJS.ProcessEnv = process.env
): SideEffectGateDecision {
  const deployTier = resolveServerDeployTier(env);
  const databaseTarget = resolveDataResetDatabaseTarget(env).target;
  const base = { channel, deployTier, databaseTarget };

  if (isVitestRunner(env) && env.SIDE_EFFECT_GATE_ENFORCE_IN_TESTS !== "1") {
    return { ...base, allowed: true, reason: "vitest_runner" };
  }

  if (deployTier === "production") {
    if (databaseTarget === "production") return { ...base, allowed: true, reason: "production_verified" };
    return { ...base, allowed: false, reason: "production_deploy_database_not_verified" };
  }

  if (databaseTarget === "production") {
    return { ...base, allowed: false, reason: "non_production_deploy_production_database" };
  }
  if (databaseTarget === "unknown") {
    return { ...base, allowed: false, reason: "non_production_deploy_unknown_database" };
  }

  if (!nonProdAllowlist(env).has(channel)) {
    return { ...base, allowed: false, reason: "non_production_channel_not_allowlisted" };
  }
  return { ...base, allowed: true, reason: "non_production_allowlisted" };
}

const warnedChannels = new Set<string>();

/**
 * 판정 + 차단 시 채널·사유를 1회만 기록(개인정보·자격증명 값은 기록하지 않음).
 * 호출부는 `allowed=false` 면 외부 호출 없이 「건너뜀」 결과를 돌려준다.
 */
export function checkSideEffectAllowed(
  channel: SideEffectChannel,
  env: NodeJS.ProcessEnv = process.env
): SideEffectGateDecision {
  const decision = evaluateSideEffectGate(channel, env);
  if (!decision.allowed) {
    const key = `${channel}:${decision.reason}`;
    if (!warnedChannels.has(key)) {
      warnedChannels.add(key);
      console.warn("[side-effect-gate] blocked", {
        channel,
        reason: decision.reason,
        deployTier: decision.deployTier,
        databaseTarget: decision.databaseTarget,
      });
    }
  }
  return decision;
}

export function resetSideEffectGateWarningsForTests(): void {
  warnedChannels.clear();
}
