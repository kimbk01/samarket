/**
 * Hub R1–R4 measurement (code-path evidence).
 * Used to decide quarantine deletion. Not a runtime product module.
 *
 * Phase J1 (2026-07-24):
 * - R1 applyCommunityMessengerUnreadOptimistic: deleted (call-0 + import-ban).
 * - R4 tier1-admin-notice-bell-supplement: deleted (always-0 noop; Bell uses Domain total).
 * - R2 OWNER_HUB_BADGE_POLL 180s: KEEP until Domain hub fields split.
 * - R3 badge-count 45s poll: KEEP (Domain network source).
 */

export type HubQuarantineMeasureId = "R1" | "R2" | "R3" | "R4";

export type HubQuarantineMeasureRow = {
  id: HubQuarantineMeasureId;
  symbol: string;
  productCallers: number;
  verdict: "remove_now" | "keep" | "defer_surface_cutover" | "deleted";
  reason: string;
};

export const HUB_R1_R4_MEASUREMENT: readonly HubQuarantineMeasureRow[] = [
  {
    id: "R1",
    symbol: "applyCommunityMessengerUnreadOptimistic",
    productCallers: 0,
    verdict: "deleted",
    reason: "Phase J1: call-0 proven; symbol removed; verify:badge-import-ban.",
  },
  {
    id: "R2",
    symbol: "OWNER_HUB_BADGE_POLL_INTERVAL_MS",
    productCallers: 1,
    verdict: "keep",
    reason:
      "Poll refreshes full hub breakdown (store attention + social + CM). Removing stalls non-CM hub digits.",
  },
  {
    id: "R3",
    symbol: "App Icon 45s poll + hub resync cross-write",
    productCallers: 1,
    verdict: "keep",
    reason:
      "Bell/AppIcon wired: poll is network source through applyBellBadgeProjection. Do not delete.",
  },
  {
    id: "R4",
    symbol: "tier1-admin-notice-bell-supplement",
    productCallers: 0,
    verdict: "deleted",
    reason:
      "Phase J1: always-0 noop deleted; Header Bell = Domain projection total only.",
  },
] as const;

export function hubQuarantineIdsMarkedRemoveNow(): HubQuarantineMeasureId[] {
  return HUB_R1_R4_MEASUREMENT.filter((r) => r.verdict === "remove_now").map((r) => r.id);
}

export function hubQuarantineIdsDeleted(): HubQuarantineMeasureId[] {
  return HUB_R1_R4_MEASUREMENT.filter((r) => r.verdict === "deleted").map((r) => r.id);
}
