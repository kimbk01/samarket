/**
 * Store Detail READY authority — SSOT for enter reveal inputs.
 * ROUTE PRESENTATION remains DeliveryPresentationShell; this module only answers
 * "destination Store Detail is coherent enough to reveal".
 *
 * States: BOOT → READY_TO_REVEAL → REVEALED
 */

export const STORE_DETAIL_DATA_READY_EVENT = "dibay:store-detail-data-ready";

export type StoreDetailReadyPhase = "boot" | "ready_to_reveal" | "revealed";

export type StoreDetailReadyInputs = {
  shellReady: boolean;
  menusReady: boolean;
  focusRequired: boolean;
  focusTargetReady: boolean;
};

export function resolveStoreDetailReadyPhase(
  inputs: StoreDetailReadyInputs,
  previouslyRevealed = false
): StoreDetailReadyPhase {
  if (previouslyRevealed) return "revealed";
  const base = inputs.shellReady && inputs.menusReady;
  const focusOk = !inputs.focusRequired || inputs.focusTargetReady;
  if (base && focusOk) return "ready_to_reveal";
  return "boot";
}

export function isStoreDetailReadyToReveal(
  inputs: StoreDetailReadyInputs,
  previouslyRevealed = false
): boolean {
  const phase = resolveStoreDetailReadyPhase(inputs, previouslyRevealed);
  return phase === "ready_to_reveal" || phase === "revealed";
}
