/**
 * C7.5 — Per-surface composition policy revision (optimistic concurrency token).
 */

import type { StoresCompositionSurface } from "@/lib/stores/composition/stores-composition-contract";

export type CompositionPolicyCasResult =
  | { ok: true; revision: number }
  | { ok: false; error: "stale_revision"; currentRevision: number; expectedRevision: number }
  | { ok: false; error: string; currentRevision?: number };

export function parseExpectedCompositionPolicyRevision(raw: unknown): number | "invalid" {
  if (raw === undefined || raw === null) return "invalid";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export function isCompositionPolicyStaleError(
  error: unknown
): error is { error: "stale_revision"; currentRevision: number } {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { error?: string }).error === "stale_revision" &&
    Number.isInteger((error as { currentRevision?: number }).currentRevision)
  );
}

export type CompositionPolicySurfaceState = {
  surface: StoresCompositionSurface;
  revision: number;
};
