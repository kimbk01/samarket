/** 매장 포인트 — 사용자 point.ts 와 분리 */

export type StorePointLedgerEntryType =
  | "store_order_fee"
  | "store_charge"
  | "admin_adjust"
  | "refund"
  | "bonus";

export type StorePointChargeRequestStatus =
  | "pending"
  | "waiting_confirm"
  | "on_hold"
  | "approved"
  | "rejected"
  | "cancelled";

export interface StorePointLedgerEntry {
  id: string;
  storeId: string;
  orderId: string | null;
  entryType: StorePointLedgerEntryType;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface StorePointChargeRequest {
  id: string;
  storeId: string;
  ownerUserId: string;
  paymentMethod: string;
  paymentAmount: number;
  pointAmount: number;
  requestStatus: StorePointChargeRequestStatus;
  depositorName: string;
  bankName: string;
  receiptImageUrl: string;
  userMemo: string | null;
  adminMemo: string | null;
  requestedAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export type PlatformAdminInquiryType =
  | "general"
  | "store_ops"
  | "store_point"
  | "settlement"
  | "ad";

export type PlatformAdminInquiryStatus = "open" | "answered" | "closed";

export interface PlatformAdminInquiry {
  id: string;
  inquiryType: PlatformAdminInquiryType;
  storeId: string | null;
  fromUserId: string;
  subject: string;
  content: string;
  attachmentUrls: string[];
  status: PlatformAdminInquiryStatus;
  answer: string | null;
  answeredAt: string | null;
  relatedChargeRequestId: string | null;
  createdAt: string;
}
