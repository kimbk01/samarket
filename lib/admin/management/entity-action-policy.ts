import type { BulkActionId, DeleteMode } from "./types";

export type DeleteConfirmMode = "danger_confirm" | "strong_danger_confirm" | "blocked";

/**
 * UI adapter around existing backend authority — not a new business owner.
 * ARO-OPS-UX-002-B1: expose soft vs hard semantics without inventing mutation SSOT.
 */
export type EntityActionPolicy = {
  entityKind: string;
  canDelete: boolean;
  deleteMode: DeleteMode;
  canHide: boolean;
  canRestore: boolean;
  /** Soft/status delete (row remains). Derived from allowedBulkActions + canDelete when set. */
  canSoftDelete: boolean;
  canChangeStatus: boolean;
  allowedBulkActions: readonly BulkActionId[];
  /** Hard delete must stay unavailable when backend/UI is NOT_READY or blocked. */
  hardDeleteAvailable: boolean;
  /** Canonical soft mutation path id (documentation / matrix). */
  softMutationOwner: string | null;
  /** Canonical hard mutation path id — null when hardDeleteAvailable is false. */
  hardMutationOwner: string | null;
  softConfirmMode: DeleteConfirmMode;
  hardConfirmMode: DeleteConfirmMode;
};

/** Alias for matrix reporting — hardDeleteAvailable && canDelete. */
export function canHardDelete(policy: EntityActionPolicy): boolean {
  return policy.canDelete && policy.hardDeleteAvailable;
}

export function isBulkActionAllowed(
  policy: EntityActionPolicy,
  action: BulkActionId
): boolean {
  if (action === "hard_delete" && !policy.hardDeleteAvailable) return false;
  if (action === "soft_delete") {
    if (!policy.canDelete || !policy.canSoftDelete) return false;
  }
  if (action === "hard_delete") {
    if (!policy.canDelete) return false;
  }
  if (action === "hide" && !policy.canHide) return false;
  if (action === "restore" && !policy.canRestore) return false;
  if (action === "change_status" && !policy.canChangeStatus) return false;
  return policy.allowedBulkActions.includes(action);
}

export function listVisibleBulkActions(policy: EntityActionPolicy): BulkActionId[] {
  return policy.allowedBulkActions.filter((a) => isBulkActionAllowed(policy, a));
}
