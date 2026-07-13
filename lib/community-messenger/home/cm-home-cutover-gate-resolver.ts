/**
 * DIBAY Messenger — Cutover Runtime Gate 서버 cohort resolver (SCAFFOLD, 순수 함수).
 *
 * 입력: 정규화된 config + 인증 userId → 출력: 사용자별 effective gate.
 *
 * 최종 resolver 순서 (고정):
 *  1. kill=true            → LEGACY (kill)  — state/cohort/pillarScope 보다 우선
 *  2. state === LEGACY     → LEGACY
 *  3. userId 없음          → LEGACY (cohort 계산 불가)
 *  4. allowlist 포함        → 설정 state
 *  5. percent hash bucket   → 설정 state
 *  6. 그 외                → LEGACY
 *
 * cohort 계산은 **서버에서만** 한다 (클라이언트 계산 금지).
 */

import {
  cmHomeCutoverStableBucket,
  cmHomeCutoverStateToDispatchRead,
  legacyEffectiveGate,
  normalizeCmHomeCutoverAllowlist,
  type CmHomeCutoverEffectiveGate,
  type CmHomeCutoverGateConfigV1,
  CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";

export function isUserInCmHomeCutoverCohort(
  config: CmHomeCutoverGateConfigV1,
  userId: string | null | undefined
): boolean {
  const id = String(userId ?? "").trim();
  if (!id) return false;
  const allowlist = normalizeCmHomeCutoverAllowlist(config.cohort?.allowlist);
  if (allowlist.includes(id)) return true;
  const percent = config.cohort?.percent ?? 0;
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return cmHomeCutoverStableBucket(id) < percent;
}

/**
 * 사용자별 effective gate. 어떤 경우에도 금지 조합을 내려보내지 않는다(전부 정규 상태).
 */
export function resolveCmHomeCutoverEffectiveGate(
  config: CmHomeCutoverGateConfigV1,
  userId: string | null | undefined
): CmHomeCutoverEffectiveGate {
  const gateVersion = Number.isFinite(config.gateVersion) && config.gateVersion >= 0 ? Math.floor(config.gateVersion) : 0;

  // 1. kill 우선
  if (config.kill === true) return legacyEffectiveGate(gateVersion, true);
  // 2. LEGACY 상태
  if (config.state === "LEGACY") return legacyEffectiveGate(gateVersion, false);
  // 3. 미인증
  if (!String(userId ?? "").trim()) return legacyEffectiveGate(gateVersion, false);
  // 4·5. cohort
  if (!isUserInCmHomeCutoverCohort(config, userId)) return legacyEffectiveGate(gateVersion, false);

  const { dispatch, read } = cmHomeCutoverStateToDispatchRead(config.state);
  return {
    schemaVersion: CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
    gateVersion,
    effectiveState: config.state,
    dispatch,
    read,
    kill: false,
    pillarScope: config.pillarScope,
  };
}
