/**
 * C2 — server-side composition policy write validation (C1 contract authority).
 */

import type {
  StoresCompositionIntervalContract,
  StoresCompositionSectionContract,
  StoresCompositionSurface,
} from "@/lib/stores/composition/stores-composition-contract";
import { STORES_COMPOSITION_SURFACES } from "@/lib/stores/composition/stores-composition-contract";
import { getCanonicalCompositionRow, getCanonicalCompositionRows } from "@/lib/stores/composition/stores-composition-canonical-registry";

/** Forbidden Admin write keys — ranking / discovery authority. */
export const STORES_COMPOSITION_FORBIDDEN_WRITE_FIELDS = [
  "rankingWeight",
  "popularityWeight",
  "ratingWeight",
  "distanceWeight",
  "newStoreBoost",
  "campaignBoost",
  "manualStoreRank",
  "manualProductRank",
  "ranking_score",
  "sort_authority",
] as const;

const MAX_ITEMS_CEILING = 500;
const MAX_ORDER = 99;

export type StoresCompositionPolicyWriteInput = {
  surface: string;
  slot: string;
  contentType?: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: StoresCompositionIntervalContract;
};

export type StoresCompositionPolicyValidationError = {
  code: string;
  field?: string;
  slot?: string;
};

export function detectForbiddenCompositionWriteFields(
  body: Record<string, unknown>
): string | null {
  for (const key of STORES_COMPOSITION_FORBIDDEN_WRITE_FIELDS) {
    if (key in body) return key;
  }
  for (const row of Array.isArray(body.rows) ? body.rows : []) {
    if (!row || typeof row !== "object") continue;
    for (const key of STORES_COMPOSITION_FORBIDDEN_WRITE_FIELDS) {
      if (key in (row as Record<string, unknown>)) return key;
    }
  }
  return null;
}

function isAllowedSurface(surface: string): surface is StoresCompositionSurface {
  return (STORES_COMPOSITION_SURFACES as readonly string[]).includes(surface);
}

function parseInterval(raw: unknown): StoresCompositionIntervalContract | "invalid" {
  if (!raw || typeof raw !== "object") return "invalid";
  const o = raw as Record<string, unknown>;
  if (o.consumed === false) {
    if (o.reason === "NOT_CONSUMED") return { consumed: false, reason: "NOT_CONSUMED" };
    return "invalid";
  }
  if (o.consumed === true) {
    const everyN = Number(o.everyN);
    if (!Number.isFinite(everyN) || everyN <= 0) return "invalid";
    // C2 — interval engine NOT_STARTED; reject consumed intervals at write time.
    return "invalid";
  }
  return "invalid";
}

export function validateCompositionPolicyWriteRow(
  input: StoresCompositionPolicyWriteInput
): StoresCompositionPolicyValidationError | null {
  if (!isAllowedSurface(input.surface)) {
    return { code: "invalid_surface", field: "surface" };
  }

  const canonical = getCanonicalCompositionRow(input.surface, input.slot);
  if (!canonical) {
    return { code: "invalid_slot", field: "slot", slot: input.slot };
  }

  if (input.contentType != null && input.contentType !== canonical.contentType) {
    return { code: "content_type_mismatch", field: "contentType", slot: input.slot };
  }

  if (typeof input.enabled !== "boolean") {
    return { code: "invalid_enabled", field: "enabled", slot: input.slot };
  }

  if (!Number.isInteger(input.order) || input.order < 0 || input.order > MAX_ORDER) {
    return { code: "invalid_order", field: "order", slot: input.slot };
  }

  if (input.max != null) {
    if (!Number.isInteger(input.max) || input.max < 0 || input.max > MAX_ITEMS_CEILING) {
      return { code: "invalid_max", field: "max", slot: input.slot };
    }
  }

  const interval = input.interval;
  if (interval.consumed !== false || interval.reason !== "NOT_CONSUMED") {
    return { code: "interval_not_consumed_only", field: "interval", slot: input.slot };
  }

  return null;
}

export function validateCompositionPolicyBatch(
  surface: StoresCompositionSurface,
  rows: readonly StoresCompositionPolicyWriteInput[]
): StoresCompositionPolicyValidationError | null {
  const forbidden = rows.find((r) => r.surface !== surface);
  if (forbidden) {
    return { code: "surface_mismatch", field: "surface", slot: forbidden.slot };
  }

  const orders = new Set<number>();
  for (const row of rows) {
    const err = validateCompositionPolicyWriteRow(row);
    if (err) return err;
    if (orders.has(row.order)) {
      return { code: "duplicate_order", field: "order", slot: row.slot };
    }
    orders.add(row.order);
  }

  const canonical = getCanonicalCompositionRows(surface);
  if (rows.length !== canonical.length) {
    return { code: "incomplete_surface_rows", field: "rows" };
  }

  const slotSet = new Set(rows.map((r) => r.slot));
  for (const c of canonical) {
    if (!slotSet.has(c.slot)) {
      return { code: "missing_slot", field: "slot", slot: c.slot };
    }
  }

  return null;
}

export function toResolvedCompositionPolicyRow(
  canonical: StoresCompositionSectionContract,
  override: Partial<Pick<StoresCompositionSectionContract, "enabled" | "order" | "max" | "interval">> | null
): StoresCompositionSectionContract {
  if (!override) return { ...canonical };
  return {
    ...canonical,
    enabled: override.enabled ?? canonical.enabled,
    order: override.order ?? canonical.order,
    max: override.max !== undefined ? override.max : canonical.max,
    interval: override.interval ?? canonical.interval,
  };
}
