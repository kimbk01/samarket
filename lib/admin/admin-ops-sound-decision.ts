/**
 * P0-D — Admin ops sound decision SSOT.
 * RT wake-up ≠ sound. UPDATE must never rely on dedupe to suppress wrong sounds.
 */
import {
  isAdminActionableCommunityReport,
  isAdminActionableStoreApproval,
  isAdminActionableStoreReport,
  isAdminActionableTradeReport,
} from "@/lib/admin/admin-ops-actionable-status";

export type AdminOpsRtEventType = "INSERT" | "UPDATE" | "DELETE";

function rowStatus(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const v = row.status ?? row.approval_status ?? row.event_status;
  return String(v ?? "").trim();
}

function wasAdminActionableStoreApproval(oldStatus: string, newStatus: string): boolean {
  return isAdminActionableStoreApproval(oldStatus) || isAdminActionableStoreApproval(newStatus);
}

function wasAdminActionableTradeReport(oldStatus: string, newStatus: string): boolean {
  return isAdminActionableTradeReport(oldStatus) || isAdminActionableTradeReport(newStatus);
}

function wasAdminActionableStoreReport(oldStatus: string, newStatus: string): boolean {
  return isAdminActionableStoreReport(oldStatus) || isAdminActionableStoreReport(newStatus);
}

function wasAdminActionableCommunityReport(oldStatus: string, newStatus: string): boolean {
  return isAdminActionableCommunityReport(oldStatus) || isAdminActionableCommunityReport(newStatus);
}

/**
 * True only when RT represents a newly arrived Admin-actionable workload (INSERT),
 * or rare terminal→actionable re-open with genuinely new Admin work.
 */
export function shouldPlayAdminOpsSound(input: {
  eventType: AdminOpsRtEventType;
  sourceTable: string;
  oldRow?: Record<string, unknown> | null;
  newRow?: Record<string, unknown> | null;
}): boolean {
  const table = String(input.sourceTable ?? "").trim();
  const eventType = input.eventType;

  if (eventType === "DELETE") return false;

  const oldStatus = rowStatus(input.oldRow);
  const newStatus = rowStatus(input.newRow);

  if (eventType === "UPDATE") {
    if (table === "support_cases") {
      const was =
        oldStatus === "OPEN" || oldStatus === "WAITING_ADMIN";
      const now =
        newStatus === "OPEN" || newStatus === "WAITING_ADMIN";
      // Reopen / customer reply → admin must act again
      return !was && now;
    }
    if (table === "stores") {
      const wasActionable = isAdminActionableStoreApproval(oldStatus);
      const nowActionable = isAdminActionableStoreApproval(newStatus);
      return !wasActionable && nowActionable;
    }
    if (table === "reports") {
      const wasActionable = isAdminActionableTradeReport(oldStatus);
      const nowActionable = isAdminActionableTradeReport(newStatus);
      return !wasActionable && nowActionable;
    }
    if (table === "store_reports") {
      const wasActionable = isAdminActionableStoreReport(oldStatus);
      const nowActionable = isAdminActionableStoreReport(newStatus);
      return !wasActionable && nowActionable;
    }
    if (table === "community_reports") {
      const wasActionable = isAdminActionableCommunityReport(oldStatus);
      const nowActionable = isAdminActionableCommunityReport(newStatus);
      return !wasActionable && nowActionable;
    }
    return false;
  }

  if (eventType !== "INSERT") return false;

  if (table === "support_cases") {
    return newStatus === "OPEN" || newStatus === "WAITING_ADMIN" || !newStatus;
  }
  if (table === "stores") {
    return isAdminActionableStoreApproval(newStatus);
  }
  if (table === "reports") {
    return isAdminActionableTradeReport(newStatus);
  }
  if (table === "store_reports") {
    return isAdminActionableStoreReport(newStatus);
  }
  if (table === "community_reports") {
    return isAdminActionableCommunityReport(newStatus);
  }

  return false;
}

/** Whether this RT event should refresh ADMIN_Q (INSERT/UPDATE on watched tables). */
export function shouldRefreshAdminOpsQueue(input: {
  eventType: AdminOpsRtEventType;
  sourceTable: string;
  oldRow?: Record<string, unknown> | null;
  newRow?: Record<string, unknown> | null;
}): boolean {
  if (input.eventType === "DELETE") return true;
  const table = String(input.sourceTable ?? "").trim();
  const oldStatus = rowStatus(input.oldRow);
  const newStatus = rowStatus(input.newRow);

  if (table === "support_cases") {
    return true;
  }
  if (table === "stores") {
    return wasAdminActionableStoreApproval(oldStatus, newStatus) || input.eventType === "INSERT";
  }
  if (table === "reports") {
    return wasAdminActionableTradeReport(oldStatus, newStatus) || input.eventType === "INSERT";
  }
  if (table === "store_reports") {
    return wasAdminActionableStoreReport(oldStatus, newStatus) || input.eventType === "INSERT";
  }
  if (table === "community_reports") {
    return wasAdminActionableCommunityReport(oldStatus, newStatus) || input.eventType === "INSERT";
  }
  return true;
}
