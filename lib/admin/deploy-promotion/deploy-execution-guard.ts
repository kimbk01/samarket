/**
 * Production promote / rollback execution guard (Area B).
 * Area A may build UI + matrix; execution stays fail-closed until Owner unlock.
 */

import { translate } from "@/lib/i18n/messages";

export type ProductionExecutionDecision = {
  allowed: boolean;
  reason: string;
  /** Safe for admin UI — no secrets */
  messageKo: string;
  messageEn: string;
};

/**
 * Dual key: even if `DIBAY_PROMOTE_ENABLED=1` for dry wiring,
 * execution requires explicit unlock (Owner console after auth split).
 */
export function evaluateProductionPromoteExecution(
  env: NodeJS.ProcessEnv = process.env
): ProductionExecutionDecision {
  const enabled = (env.DIBAY_PROMOTE_ENABLED ?? "").trim() === "1";
  const unlocked = (env.DIBAY_PROMOTE_EXECUTION_UNLOCKED ?? "").trim() === "1";

  if (!enabled) {
    return {
      allowed: false,
      reason: "promote_not_enabled",
      messageKo: translate("ko", "admin_deploy_promote_not_enabled"),
      messageEn: translate("en", "admin_deploy_promote_not_enabled"),
    };
  }
  if (!unlocked) {
    return {
      allowed: false,
      reason: "production_execution_blocked",
      messageKo: translate("ko", "admin_deploy_production_execution_blocked"),
      messageEn: translate("en", "admin_deploy_production_execution_blocked"),
    };
  }
  return {
    allowed: true,
    reason: "execution_unlocked",
    messageKo: "운영 실행이 잠금 해제되었습니다.",
    messageEn: "Production execution is unlocked.",
  };
}

export function evaluateProductionRollbackExecution(
  env: NodeJS.ProcessEnv = process.env
): ProductionExecutionDecision {
  // Same unlock gate — rollback is also Area B.
  const base = evaluateProductionPromoteExecution(env);
  if (!base.allowed) {
    return {
      ...base,
      reason:
        base.reason === "promote_not_enabled"
          ? "rollback_not_enabled"
          : "rollback_execution_blocked",
    };
  }
  return base;
}
