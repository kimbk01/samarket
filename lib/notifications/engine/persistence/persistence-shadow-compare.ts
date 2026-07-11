/**
 * Phase 3-1 — Legacy vs Engine persistence shadow compare.
 * Mismatch → STOP (log only; Legacy remains authoritative).
 */

import {
  persistenceOperationKey,
  sortPersistenceOperations,
  type PersistencePlan,
} from "@/lib/notifications/engine/persistence/persistence-operation";

export type PersistenceShadowCompareResult = {
  match: boolean;
  legacyCount: number;
  engineCount: number;
  legacyOnly: string[];
  engineOnly: string[];
};

export function comparePersistencePlans(
  legacyPlan: PersistencePlan | null,
  enginePlan: PersistencePlan | null
): PersistenceShadowCompareResult {
  const legacyOps = sortPersistenceOperations(legacyPlan?.operations ?? []);
  const engineOps = sortPersistenceOperations(enginePlan?.operations ?? []);

  const legacyKeys = new Set(legacyOps.map(persistenceOperationKey));
  const engineKeys = new Set(engineOps.map(persistenceOperationKey));

  const legacyOnly = [...legacyKeys].filter((key) => !engineKeys.has(key)).sort();
  const engineOnly = [...engineKeys].filter((key) => !legacyKeys.has(key)).sort();

  return {
    match: legacyOnly.length === 0 && engineOnly.length === 0,
    legacyCount: legacyOps.length,
    engineCount: engineOps.length,
    legacyOnly,
    engineOnly,
  };
}

export function logPersistenceShadowCompareResult(
  result: PersistenceShadowCompareResult,
  source: string,
  meta?: Record<string, unknown>
): void {
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_NOTIFICATION_ENGINE_SHADOW_LOG !== "1") {
    return;
  }

  const payload = {
    match: result.match,
    legacyCount: result.legacyCount,
    engineCount: result.engineCount,
    legacyOnly: result.legacyOnly,
    engineOnly: result.engineOnly,
    ...meta,
  };

  if (result.match) {
    // eslint-disable-next-line no-console
    console.info("[notification-engine-persistence-shadow]", source, "PASS", payload);
    return;
  }

  // eslint-disable-next-line no-console
  console.error("[notification-engine-persistence-shadow]", source, "STOP", payload);
}
