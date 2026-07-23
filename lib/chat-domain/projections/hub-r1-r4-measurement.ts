/**
 * Hub R1–R4 measurement (code-path evidence, 2026-07-23).
 * Used to decide quarantine deletion. Not a runtime product module.
 *
 * Findings (HEAD after Bell/AppIcon slice-1):
 * - R1 applyCommunityMessengerUnreadOptimistic: callers=0 (removed / noop export).
 * - R2 OWNER_HUB_BADGE_POLL 180s: KEEP until Domain hub fields split.
 * - R3 badge-count 45s poll: now network source via applyBellBadgeProjection — KEEP (not bypass).
 * - R4 adminNotice optimistic: now via applyBellBadgeProjection — KEEP (product UX).
 */

export type HubQuarantineMeasureId = "R1" | "R2" | "R3" | "R4";

export type HubQuarantineMeasureRow = {
  id: HubQuarantineMeasureId;
  symbol: string;
  productCallers: number;
  verdict: "remove_now" | "keep" | "defer_surface_cutover";
  reason: string;
};

export const HUB_R1_R4_MEASUREMENT: readonly HubQuarantineMeasureRow[] = [
  {
    id: "R1",
    symbol: "applyCommunityMessengerUnreadOptimistic",
    productCallers: 0,
    verdict: "remove_now",
    reason:
      "Callers removed; export noop. Increase path already requests hub resync.",
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
    symbol: "Bell adminNotice supplement parallel write",
    productCallers: 1,
    verdict: "keep",
    reason:
      "Bell wired: optimistic_admin goes through applyBellBadgeProjection. Keep supplement UX.",
  },
] as const;

export function hubQuarantineIdsMarkedRemoveNow(): HubQuarantineMeasureId[] {
  return HUB_R1_R4_MEASUREMENT.filter((r) => r.verdict === "remove_now").map((r) => r.id);
}
