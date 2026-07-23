/**
 * Phase 10 — Shell 최종 조합 계약 SSOT.
 * ViewModel / Contribution 만 조합. raw room · bootstrap · cache · Domain 재추론 금지.
 * production UI wiring · cutover · OS Badge setter 금지.
 */
export const PHASE10_SHELL_PRODUCTION_WIRING = false as const;

/** D1-1 Runtime PASS 는 Atomic 실DB 검증 전 아님 — Shell 단계에서 주장 금지 */
export const PHASE10_D1_1_RUNTIME_PASS_CLAIMED = false as const;

export const PHASE10_SHELL_SURFACE_CONTRACT = {
  inboxDomains: ["general_direct", "group"] as const,
  tradeHubDomain: "trade" as const,
  orderHubDomain: "store_order" as const,
  messengerNavDomains: ["general_direct", "group"] as const,
  deliveryNavUnion: "orderStatus_union_store_order" as const,
  appIconUnit: "notificationEventCount" as const,
} as const;

export const PHASE10_SHELL_FORBIDDEN_INPUT_KINDS = [
  "raw_room",
  "raw_rooms_array",
  "bootstrap_raw",
  "domain_cache_entry",
  "roomType",
  "direct_key",
  "contextMeta",
  "pathname_inference",
  "title_inference",
] as const;

export type Phase10ForbiddenInputKind = (typeof PHASE10_SHELL_FORBIDDEN_INPUT_KINDS)[number];

export function assertPhase10ShellWiringOff(): void {
  if (PHASE10_SHELL_PRODUCTION_WIRING) {
    throw new Error("dibay_phase10_shell_production_wiring_must_remain_false");
  }
}

export function assertPhase10DoesNotClaimD11RuntimePass(): void {
  if (PHASE10_D1_1_RUNTIME_PASS_CLAIMED) {
    throw new Error("dibay_phase10_must_not_claim_d1_1_runtime_pass");
  }
}

export function assertPhase10RejectsForbiddenInput(kind: Phase10ForbiddenInputKind): never {
  throw new Error(`dibay_phase10_shell_forbids_input:${kind}`);
}

/** Shell 이 Domain 재추론 시도 시 fail-closed */
export function assertPhase10NoDomainReinference(attempt: {
  roomType?: string | null;
  directKey?: string | null;
  pathname?: string | null;
  contextMetaKind?: string | null;
  titleForInference?: string | null;
}): void {
  if (attempt.roomType != null) assertPhase10RejectsForbiddenInput("roomType");
  if (attempt.directKey != null) assertPhase10RejectsForbiddenInput("direct_key");
  if (attempt.pathname != null) assertPhase10RejectsForbiddenInput("pathname_inference");
  if (attempt.contextMetaKind != null) assertPhase10RejectsForbiddenInput("contextMeta");
  if (attempt.titleForInference != null) assertPhase10RejectsForbiddenInput("title_inference");
}
