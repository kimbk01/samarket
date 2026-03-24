/**
 * 22단계: 광고 신청 / 유료 노출 타입
 */

export type AdTargetType = "product" | "shop" | "banner";

export type AdPlacement =
  | "home_top"
  | "home_middle"
  | "search_top"
  | "product_detail"
  | "shop_featured";

export type AdPaymentMethod =
  | "bank_transfer"
  | "gcash"
  | "manual_confirm";

export type AdPaymentStatus =
  | "unpaid"
  | "waiting_confirm"
  | "paid"
  | "refunded";

export type AdApplicationStatus =
  | "pending"
  | "waiting_payment"
  | "approved"
  | "rejected"
  | "active"
  | "expired"
  | "cancelled";

export interface AdApplication {
  id: string;
  applicantUserId: string;
  applicantNickname: string;
  targetType: AdTargetType;
  targetId: string;
  targetTitle: string;
  placement: AdPlacement;
  planName: string;
  durationDays: number;
  unitPrice: number;
  totalPrice: number;
  paymentMethod: AdPaymentMethod;
  paymentStatus: AdPaymentStatus;
  applicationStatus: AdApplicationStatus;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
  applicantMemo?: string;
}

export interface AdPlan {
  id: string;
  name: string;
  targetType: AdTargetType;
  placement: AdPlacement;
  durationDays: number;
  price: number;
  isActive: boolean;
  description: string;
}

export type AdLogActionType =
  | "apply"
  | "update"
  | "cancel"
  | "mark_paid"
  | "approve"
  | "reject"
  | "activate"
  | "expire";

export interface AdApplicationLog {
  id: string;
  adApplicationId: string;
  actionType: AdLogActionType;
  actorType: "user" | "admin";
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}

export type PromotedItemStatus =
  | "scheduled"
  | "active"
  | "expired"
  | "paused";

export interface PromotedItem {
  id: string;
  adApplicationId: string;
  targetType: AdTargetType;
  targetId: string;
  targetTitle: string;
  placement: AdPlacement;
  status: PromotedItemStatus;
  startAt: string;
  endAt: string;
  priority: number;
  createdAt: string;
}
