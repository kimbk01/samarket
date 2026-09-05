import type { EntityActionPolicy } from "../entity-action-policy";

/**
 * Trade listing (posts-management) policy adapter.
 * Soft moderation via existing confirmAndUpdateAdminPostStatus.
 * Hard DB delete UI remains NOT_READY / unavailable (API may exist but must not be exposed).
 */
export const TRADE_POST_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "trade_post",
  canDelete: true,
  deleteMode: "SOFT_DELETE",
  canHide: true,
  canRestore: true,
  canChangeStatus: true,
  allowedBulkActions: ["restore", "hide", "soft_delete"],
  hardDeleteAvailable: false,
};

export const MEMBER_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "member",
  canDelete: false,
  deleteMode: "BLOCKED",
  canHide: false,
  canRestore: false,
  canChangeStatus: true,
  allowedBulkActions: [],
  hardDeleteAvailable: false,
};

export const ORDER_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "store_order",
  canDelete: false,
  deleteMode: "STATUS_ONLY",
  canHide: false,
  canRestore: false,
  canChangeStatus: true,
  allowedBulkActions: ["cancel"],
  hardDeleteAvailable: false,
};

export const SETTLEMENT_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "settlement",
  canDelete: false,
  deleteMode: "BLOCKED",
  canHide: false,
  canRestore: false,
  canChangeStatus: false,
  allowedBulkActions: [],
  hardDeleteAvailable: false,
};
