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

/** Member list: no generic bulk hard-delete. Deletion-request queue is separate. */
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

/**
 * Community post — soft status via PATCH; hard DB delete via engine bulk-delete.
 * status=deleted is soft (not hard wipe).
 */
export const COMMUNITY_POST_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "community_post",
  canDelete: true,
  deleteMode: "HARD_DELETE",
  canHide: true,
  canRestore: true,
  canChangeStatus: true,
  allowedBulkActions: ["hide", "restore", "soft_delete", "hard_delete"],
  hardDeleteAvailable: true,
};

/** Community comment — soft status PATCH only (no list hard wipe API). */
export const COMMUNITY_COMMENT_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "community_comment",
  canDelete: true,
  deleteMode: "SOFT_DELETE",
  canHide: true,
  canRestore: true,
  canChangeStatus: true,
  allowedBulkActions: ["hide", "restore", "soft_delete"],
  hardDeleteAvailable: false,
};
