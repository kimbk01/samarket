import type { BulkActionId, DeleteMode } from "./types";

/**
 * UI adapter around existing backend authority — not a new business owner.
 */
export type EntityActionPolicy = {
  entityKind: string;
  canDelete: boolean;
  deleteMode: DeleteMode;
  canHide: boolean;
  canRestore: boolean;
  canChangeStatus: boolean;
  allowedBulkActions: readonly BulkActionId[];
  /** Hard delete must stay unavailable when backend/UI is NOT_READY or blocked. */
  hardDeleteAvailable: boolean;
};

export function isBulkActionAllowed(
  policy: EntityActionPolicy,
  action: BulkActionId
): boolean {
  if (action === "hard_delete" && !policy.hardDeleteAvailable) return false;
  if (action === "soft_delete" || action === "hard_delete") {
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
