/**
 * DIBAY Messenger Domain rebuild — Phase 실행 순서 SSOT.
 *
 * Phase 2–11A Domain 모듈 계약 완료. Runtime UI/persistent wiring · cutover 는 별도 승인.
 * Atomic Read 실DB · D1-1 Runtime PASS 는 Staging 후 별도.
 */
export const MESSENGER_DOMAIN_BUILD_PHASE_ORDER = [
  { phase: 2, domain: "general_direct", status: "done" },
  { phase: 3, domain: "trade", status: "done" },
  { phase: 4, domain: "store_order", status: "done" },
  {
    phase: 4.5,
    domain: "shell_integration_contract",
    status: "pass",
  },
  { phase: 5, domain: "group", status: "done" },
  { phase: 6, domain: "bootstrap_cache", status: "done" },
  { phase: 7, domain: "realtime_multitab", status: "done" },
  {
    phase: 8,
    domain: "read_unread_badge_architecture_8a_8b",
    status: "done",
  },
  {
    phase: 9,
    domain: "notification_sound_architecture",
    status: "done",
  },
  {
    phase: 10,
    domain: "shell_final_compose",
    status: "done",
  },
  {
    phase: 11.1,
    domain: "domain_db_loader_11a",
    status: "done",
  },
  {
    phase: 11.2,
    domain: "domain_live_loader_11b",
    status: "done",
  },
  {
    phase: 11.3,
    domain: "isolated_runtime_wiring_11c",
    status: "done",
  },
  {
    phase: 11.35,
    domain: "production_wiring_readiness_11c5",
    status: "done",
  },
  {
    phase: 11.4,
    domain: "bootstrap_shell_canary_read_only_11da",
    status: "done",
  },
  {
    phase: 11.45,
    domain: "legacy_new_shadow_parity_11db",
    status: "done",
  },
] as const;

export type MessengerDomainBuildPhase = (typeof MESSENGER_DOMAIN_BUILD_PHASE_ORDER)[number];

/** Group 은 shell_integration(4.5) PASS 전 착수 금지 */
export function assertGroupPhaseUnlocked(phase45Status: string): void {
  if (phase45Status !== "done" && phase45Status !== "pass") {
    throw new Error("dibay_group_phase_blocked_until_phase_4_5");
  }
}

export function getShellIntegrationPhaseStatus(): string {
  const row = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 4.5);
  return row?.status ?? "missing";
}
