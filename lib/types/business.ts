/**
 * 21단계: 비즈프로필 / 상점 타입
 */

export type BusinessProfileStatus =
  | "pending"
  | "active"
  | "paused"
  | "rejected";

export interface BusinessProfile {
  id: string;
  ownerUserId: string;
  ownerNickname: string;
  shopName: string;
  slug: string;
  logoUrl: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  barangay: string;
  /** 주소 한 줄 — DB address_line1 */
  addressStreetLine: string;
  /** 상세 — DB address_line2 */
  addressDetail: string;
  /** 한 줄 표기(목록·카드) — line1·line2·district 병합 */
  addressLabel: string;
  category: string;
  /** DB 업종·주제(있을 때) — 피드 탭과 동일 마스터 */
  storeCategoryName?: string | null;
  storeTopicName?: string | null;
  /** 공개 노출 스위치(오너 대시보드용) */
  isVisible?: boolean;
  approvalStatusRaw?: string;
  status: BusinessProfileStatus;
  followerCount: number;
  productCount: number;
  reviewCount: number;
  averageRating: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string;
  adminMemo?: string;
}

export interface BusinessProduct {
  id: string;
  businessProfileId: string;
  title: string;
  price: number;
  thumbnail: string;
  status: string;
  createdAt: string;
  /** store_product_categories.name */
  menuGroupName?: string | null;
  isFeatured?: boolean;
  itemType?: string | null;
  sortOrder?: number;
}

export type BusinessProfileLogActionType =
  | "apply"
  | "approve"
  | "reject"
  | "pause"
  | "resume"
  | "update_profile";

export interface BusinessProfileLog {
  id: string;
  businessProfileId: string;
  actionType: BusinessProfileLogActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}
