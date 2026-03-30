/**
 * 23단계: 포인트 충전 / 사용 / 원장 타입
 */

export type PointPaymentMethod =
  | "bank_transfer"
  | "gcash"
  | "manual_confirm";

export type PointChargeRequestStatus =
  | "pending"
  | "waiting_confirm"
  | "on_hold"
  | "approved"
  | "rejected"
  | "cancelled";

export interface PointChargeRequest {
  id: string;
  userId: string;
  userNickname: string;
  planId: string;
  planName: string;
  paymentMethod: PointPaymentMethod;
  paymentAmount: number;
  pointAmount: number;
  requestStatus: PointChargeRequestStatus;
  depositorName: string;
  receiptImageUrl: string;
  requestedAt: string;
  updatedAt: string;
  adminMemo?: string;
  userMemo?: string;
}

export interface PointPlan {
  id: string;
  name: string;
  paymentAmount: number;
  pointAmount: number;
  bonusPointAmount: number;
  isActive: boolean;
  description: string;
}

export type PointLedgerEntryType =
  | "charge"
  | "spend"
  | "refund"
  | "admin_adjust"
  | "expire"
  | "reward"
  | "reverse"
  | "ad_purchase"
  | "ad_refund";

export type PointLedgerRelatedType =
  | "point_charge"
  | "promoted_item"
  | "ad_application"
  | "admin_manual"
  | "community_reward"
  | "community_reclaim";

export type PointLedgerActorType = "user" | "admin" | "system";

export interface PointLedgerEntry {
  id: string;
  userId: string;
  userNickname: string;
  entryType: PointLedgerEntryType;
  amount: number;
  balanceAfter: number;
  relatedType: PointLedgerRelatedType;
  relatedId: string;
  description: string;
  createdAt: string;
  actorType: PointLedgerActorType;
  /** 26단계: 만료 정책용. 획득일/만료예정일/만료여부/만료차감량 */
  earnedAt?: string;
  expiresAt?: string;
  isExpired?: boolean;
  expiredAmount?: number;
}

export type PointPromotionTargetType = "product" | "shop";

export type PointPromotionPlacement =
  | "home_top"
  | "home_middle"
  | "search_top"
  | "shop_featured";

export type PointPromotionOrderStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled";

export interface PointPromotionOrder {
  id: string;
  userId: string;
  userNickname: string;
  targetType: PointPromotionTargetType;
  targetId: string;
  targetTitle: string;
  placement: PointPromotionPlacement;
  durationDays: number;
  pointCost: number;
  orderStatus: PointPromotionOrderStatus;
  startAt: string;
  endAt: string;
  createdAt: string;
}

export type PointActionLogType =
  | "request_charge"
  | "approve_charge"
  | "reject_charge"
  | "hold_charge"
  | "spend_points"
  | "refund_points"
  | "admin_adjust"
  | "community_reward"
  | "community_reclaim"
  | "expire_points";

export interface PointActionLog {
  id: string;
  actionType: PointActionLogType;
  actorType: "user" | "admin" | "system";
  actorId: string;
  actorNickname: string;
  targetUserId: string;
  targetUserNickname: string;
  relatedId: string;
  note: string;
  createdAt: string;
}
