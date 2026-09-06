import type { EntityActionPolicy } from "../entity-action-policy";

/**
 * Trade listing (posts-management) policy adapter.
 * Soft moderation via confirmAndApplyBulkAdminPostStatus (ONE confirm for N).
 * Hard DB delete via POST /api/admin/posts/bulk-delete with row eligibility.
 */
export const TRADE_POST_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "trade_post",
  canDelete: true,
  deleteMode: "HARD_DELETE",
  canHide: true,
  canRestore: true,
  canSoftDelete: true,
  canChangeStatus: true,
  allowedBulkActions: ["restore", "hide", "soft_delete", "hard_delete"],
  hardDeleteAvailable: true,
  softMutationOwner: "confirmAndApplyBulkAdminPostStatus→updatePostStatusAdmin(status=deleted)",
  hardMutationOwner: "POST /api/admin/posts/bulk-delete (eligibility-gated)",
  softConfirmMode: "danger_confirm",
  hardConfirmMode: "strong_danger_confirm",
};

/** Member list: no generic bulk hard-delete. Deletion-request queue is separate. */
export const MEMBER_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "member",
  canDelete: false,
  deleteMode: "BLOCKED",
  canHide: false,
  canRestore: false,
  canSoftDelete: false,
  canChangeStatus: true,
  allowedBulkActions: [],
  hardDeleteAvailable: false,
  softMutationOwner: null,
  hardMutationOwner: null,
  softConfirmMode: "blocked",
  hardConfirmMode: "blocked",
};

/** Store — finance/order dependency; no list hard wipe. */
export const STORE_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "store",
  canDelete: false,
  deleteMode: "BLOCKED",
  canHide: false,
  canRestore: false,
  canSoftDelete: false,
  canChangeStatus: true,
  allowedBulkActions: [],
  hardDeleteAvailable: false,
  softMutationOwner: null,
  hardMutationOwner: null,
  softConfirmMode: "blocked",
  hardConfirmMode: "blocked",
};

export const ORDER_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "store_order",
  canDelete: false,
  deleteMode: "STATUS_ONLY",
  canHide: false,
  canRestore: false,
  canSoftDelete: false,
  canChangeStatus: true,
  allowedBulkActions: ["cancel"],
  hardDeleteAvailable: false,
  softMutationOwner: null,
  hardMutationOwner: null,
  softConfirmMode: "blocked",
  hardConfirmMode: "blocked",
};

export const SETTLEMENT_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "settlement",
  canDelete: false,
  deleteMode: "BLOCKED",
  canHide: false,
  canRestore: false,
  canSoftDelete: false,
  canChangeStatus: false,
  allowedBulkActions: [],
  hardDeleteAvailable: false,
  softMutationOwner: null,
  hardMutationOwner: null,
  softConfirmMode: "blocked",
  hardConfirmMode: "blocked",
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
  canSoftDelete: true,
  canChangeStatus: true,
  allowedBulkActions: ["hide", "restore", "soft_delete", "hard_delete"],
  hardDeleteAvailable: true,
  softMutationOwner: "PATCH /api/admin/community/engine/posts/:id {status}",
  hardMutationOwner: "POST /api/admin/community/engine/posts/bulk-delete",
  softConfirmMode: "danger_confirm",
  hardConfirmMode: "strong_danger_confirm",
};

/** Community comment — soft status PATCH only (no list hard wipe API). */
export const COMMUNITY_COMMENT_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "community_comment",
  canDelete: true,
  deleteMode: "SOFT_DELETE",
  canHide: true,
  canRestore: true,
  canSoftDelete: true,
  canChangeStatus: true,
  allowedBulkActions: ["hide", "restore", "soft_delete"],
  hardDeleteAvailable: false,
  softMutationOwner: "PATCH /api/admin/community/engine/comments/:id {status}",
  hardMutationOwner: null,
  softConfirmMode: "danger_confirm",
  hardConfirmMode: "blocked",
};

/**
 * Chat room list — hide is Admin personal/session list filter only (not room lifecycle).
 * Hard delete: trade/general storage via bulk-delete API; CM wipe via Prelaunch Reset scope=chat.
 * Do not merge these mutation owners.
 */
export const CHAT_ROOM_ENTITY_ACTION_POLICY: EntityActionPolicy = {
  entityKind: "chat_room",
  canDelete: true,
  deleteMode: "HARD_DELETE",
  canHide: true,
  canRestore: false,
  canSoftDelete: false,
  canChangeStatus: true,
  allowedBulkActions: ["hide", "hard_delete"],
  hardDeleteAvailable: true,
  softMutationOwner: "AdminChatListPage listHiddenIds (session UI filter only)",
  hardMutationOwner:
    "POST /api/admin/chat/rooms/bulk-delete (chat_rooms|product_chats) · CM wipe = Prelaunch Reset scopes=chat",
  softConfirmMode: "danger_confirm",
  hardConfirmMode: "strong_danger_confirm",
};
