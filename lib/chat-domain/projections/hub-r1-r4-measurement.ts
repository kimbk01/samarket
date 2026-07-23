/**
 * Hub R1–R4 measurement (code-path evidence, 2026-07-23).
 * Used to decide quarantine deletion. Not a runtime product module.
 *
 * Findings (HEAD after Hub slice-1):
 * - R1 applyCommunityMessengerUnreadOptimistic: single caller
 *   `use-cm-participants-hub-sync` on unread 0→N. Always paired with
 *   `requestMessengerHubBadgeResync` on hub_sync_only increase path, or
 *   `scheduleParticipantUnreadFullEffects` otherwise. Latency-only; safe to remove
 *   if increase path always requests network resync (same handler).
 * - R2 OWNER_HUB_BADGE_POLL 180s: writes full OwnerHubBadgeBreakdown via projection
 *   (CM + store attention + social). Not CM-only — KEEP until Domain hub fields split.
 * - R3 App Icon 45s poll: Bell/AppIcon surface — defer to App Icon cutover.
 * - R4 Bell adminNotice supplement: Bell surface — defer to Bell cutover.
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
    productCallers: 1,
    verdict: "remove_now",
    reason:
      "Single caller; increase path already requests hub resync. Optimistic only hides network latency and can fight stale merge.",
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
    productCallers: -1,
    verdict: "defer_surface_cutover",
    reason: "App Icon surface still not_wired; remove with App Icon cutover.",
  },
  {
    id: "R4",
    symbol: "Bell adminNotice supplement parallel write",
    productCallers: -1,
    verdict: "defer_surface_cutover",
    reason: "Bell surface still not_wired; remove with Bell cutover.",
  },
] as const;

export function hubQuarantineIdsMarkedRemoveNow(): HubQuarantineMeasureId[] {
  return HUB_R1_R4_MEASUREMENT.filter((r) => r.verdict === "remove_now").map((r) => r.id);
}
