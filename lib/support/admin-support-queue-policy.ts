/**
 * Admin Support queue classification predicates (PHASE 3-A foundation).
 * Pure functions only — no Admin UI wiring.
 *
 * Operational classification (mutually exclusive):
 *   PRE | IN_PROGRESS | RESOLVED
 *
 * ALL is a superset query view (status != ARCHIVED), NOT a 4th exclusive status.
 */

import type { SupportCaseStatus } from "@/lib/support/support-case-types";

export type SupportQueueCaseSnapshot = {
  status: SupportCaseStatus | string;
  assigned_admin_id: string | null;
  first_admin_response_at: string | null;
};

function nonEmptyId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFirstAdminResponse(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** PRE: waiting for first admin touch (unassigned + no public admin reply). */
export function isSupportCasePreHandling(c: SupportQueueCaseSnapshot): boolean {
  if (c.status !== "OPEN" && c.status !== "WAITING_ADMIN") return false;
  if (nonEmptyId(c.assigned_admin_id)) return false;
  if (hasFirstAdminResponse(c.first_admin_response_at)) return false;
  return true;
}

/**
 * IN_PROGRESS: nonterminal and (assigned OR first admin public reply).
 * WAITING_USER always resolves here.
 */
export function isSupportCaseInProgress(c: SupportQueueCaseSnapshot): boolean {
  if (c.status === "RESOLVED" || c.status === "ARCHIVED") return false;
  if (c.status === "WAITING_USER") return true;
  if (c.status !== "OPEN" && c.status !== "WAITING_ADMIN") return false;
  return nonEmptyId(c.assigned_admin_id) || hasFirstAdminResponse(c.first_admin_response_at);
}

export function isSupportCaseResolved(c: SupportQueueCaseSnapshot): boolean {
  return c.status === "RESOLVED";
}

/**
 * Actionable for admin queue badges/counts later:
 * PRE OR WAITING_ADMIN (boolean only — no double-count aggregation here).
 */
export function isSupportCaseActionable(c: SupportQueueCaseSnapshot): boolean {
  if (c.status === "WAITING_USER") return false;
  if (c.status === "RESOLVED" || c.status === "ARCHIVED") return false;
  if (c.status === "WAITING_ADMIN") return true;
  return isSupportCasePreHandling(c);
}

/** Superset membership for ALL view — excludes ARCHIVED only. */
export function isSupportCaseInAllView(c: SupportQueueCaseSnapshot): boolean {
  return c.status !== "ARCHIVED";
}

export type SupportOperationalClass = "PRE" | "IN_PROGRESS" | "RESOLVED" | "NONE";

export function classifySupportCaseOperational(
  c: SupportQueueCaseSnapshot
): SupportOperationalClass {
  if (isSupportCaseResolved(c)) return "RESOLVED";
  if (isSupportCasePreHandling(c)) return "PRE";
  if (isSupportCaseInProgress(c)) return "IN_PROGRESS";
  return "NONE";
}
