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
  /** Snapshot: total points / payment at charge create */
  appliedRate: number;
  /** Snapshot of point_plans.rate_version at charge create */
  rateVersion: number;
  requestStatus: PointChargeRequestStatus;
  depositorName: string;
  receiptImageUrl: string;
  requestedAt: string;
  updatedAt: string;
  adminMemo?: string;
  userMemo?: string;
  approvedAt?: string;
  approvedBy?: string;
  processedAt?: string;
  processedBy?: string;
}

export interface PointPlan {
  id: string;
  name: string;
  nameKo?: string;
  nameEn?: string;
  paymentAmount: number;
  pointAmount: number;
  bonusPointAmount: number;
  currency?: string;
  isActive: boolean;
  description: string;
  descriptionKo?: string;
  descriptionEn?: string;
  sortOrder?: number;
  rateVersion: number;
}

export type PointLedgerEntryType =
  | "charge"
  | "spend"
  | "refund"
  | "admin_adjust"
  | "admin_credit"
  | "admin_debit"
  | "expire"
  | "reward"
  | "reverse"
  | "ad_purchase"
  | "ad_refund"
  | "ad_hold"
  | "ad_hold_release"
  | "ad_charge";

export type PointLedgerRelatedType =
  | "point_charge"
  | "promotion_order"
  | "promoted_item"
  | "ad_application"
  | "trade_post_ad"
  | "feed_ad_request"
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

export type PointPromotionTargetType = "product" | "shop" | "community_post";

export type PointPromotionPlacement =
  | "home_top"
  | "home_middle"
  | "search_top"
  | "shop_featured"
  /** Internal policy token — not a user-facing CTA */
  | "feed_boost"
  | "community_top_pin";

export type PointPromotionOrderStatus =
  | "pending"
  | "pending_review"
  | "active"
  | "expired"
  | "ended"
  | "rejected"
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
  /** Member promotion product SSOT id */
  productId?: string;
  domain?: string;
  idempotencyKey?: string;
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
