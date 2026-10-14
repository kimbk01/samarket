/**
 * Production promote / rollback execution guard (Area B).
 * Area A may build UI + matrix; execution stays fail-closed until Owner unlock.
 */

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
      messageKo:
        "운영 적용 실행이 비활성입니다. Owner 권한 분리·토큰 준비 후 DIBAY_PROMOTE_ENABLED를 설정하세요.",
      messageEn:
        "Production promote execution is disabled. Set DIBAY_PROMOTE_ENABLED after Owner auth split.",
    };
  }
  if (!unlocked) {
    return {
      allowed: false,
      reason: "production_execution_blocked",
      messageKo:
        "운영 적용·Rollback 실행은 권한 분리 실측 전까지 차단됩니다 (BLOCKED).",
      messageEn:
        "Production promote/rollback execution stays blocked until auth-split is proven (BLOCKED).",
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
