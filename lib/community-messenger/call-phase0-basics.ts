/**
 * Phase 0 — 발신·수신·종료·취소(음성 1:1)만 안정화.
 * 부가 UX는 이 플래그가 켜진 동안 비활성. 기본 PASS 후 하나씩 되살린다.
 */
export const CM_CALL_PHASE0_BASICS_ONLY = true;

export function isCmCallPhase0BasicsOnly(): boolean {
  return CM_CALL_PHASE0_BASICS_ONLY;
}

export function isCmCallDockEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}

export function isCmCallPipEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}

export function isCmCallVideoUpgradeEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}

/** Phase 0 — 영상 발신·수신 비활성 (음성 1:1만) */
export function isCmCallVideoEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}

export function isCmGroupCallEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}

export function isCmNativeForegroundIncomingPillEnabled(): boolean {
  return !isCmCallPhase0BasicsOnly();
}
