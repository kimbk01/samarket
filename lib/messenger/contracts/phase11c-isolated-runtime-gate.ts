/**
 * Phase 11C — Isolated Runtime Integration gate.
 * Production UI / persistent / Realtime / cutover wiring OFF.
 */
export const PHASE11C_ISOLATED_RUNTIME_PRODUCTION_WIRING = false as const;
export const PHASE11C_PRODUCTION_UI_WIRING = false as const;
export const PHASE11C_PRODUCTION_CACHE_WIRING = false as const;
export const PHASE11C_PRODUCTION_REALTIME_WIRING = false as const;
export const PHASE11C_CUTOVER_ON = false as const;

export function assertPhase11cIsolatedOnly(): void {
  if (
    PHASE11C_ISOLATED_RUNTIME_PRODUCTION_WIRING ||
    PHASE11C_PRODUCTION_UI_WIRING ||
    PHASE11C_PRODUCTION_CACHE_WIRING ||
    PHASE11C_PRODUCTION_REALTIME_WIRING ||
    PHASE11C_CUTOVER_ON
  ) {
    throw new Error("dibay_phase11c_production_wiring_forbidden");
  }
}
