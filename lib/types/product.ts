/**
 * 상품 타입 (2단계 목록 + 3단계 상세 + 5단계 내상품 호환)
 */

import type { SellerListingState } from "@/lib/products/seller-listing-state";

/** blinded, deleted: 12단계 관리자 제재용 */
export type ProductStatus =
  | "active"
  | "reserved"
  | "sold"
  | "hidden"
  | "blinded"
  | "deleted";

export interface ProductSeller {
  id: string;
  nickname: string;
  avatar: string;
  location: string;
  mannerTemp?: number;
}

export interface Product {
  id: string;
  title: string;
  price: number;
  location: string;
  createdAt: string;
  status: ProductStatus;
  thumbnail: string;
  likesCount: number;
  chatCount: number;
  isBoosted: boolean;
  distance?: number;
  /** 3단계 상세 */
  category?: string;
  images?: string[];
  description?: string;
  viewCount?: number;
  seller?: ProductSeller;
  /** 5단계 내상품: 판매자 필터·상태 변경 */
  sellerId?: string;
  updatedAt?: string;
  /** 13단계 관리자: 메모·신고수·끌올 시각 */
  adminMemo?: string;
  reportCount?: number;
  bumpedAt?: string;
  /** 게시물 관리: 무료나눔 여부 */
  isFreeShare?: boolean;
  /** 게시물 관리: 카테고리명/슬러그 (탭·필터용) */
  categoryName?: string;
  categorySlug?: string;
  /** 게시물 관리: categories.icon_key (slug와 함께 탭 매칭) */
  categoryIconKey?: string;
  /** 게시물 관리: 노출상태 (public | hidden 등) */
  visibility?: string;
  /** 게시물 관리: posts.service_id → services.service_type (home_trade, real_estate, used_car …) */
  serviceType?: string;
  /** 게시물 관리: services.slug */
  serviceSlug?: string;
  /** 게시물 관리: categories.type (trade | service | community | feature) */
  categoryType?: string;
  /** 게시물 관리: posts.type (trade | service | community | feature) */
  postKind?: string;
  /** 게시물 관리: posts.meta jsonb (환전 폼 등) */
  postMeta?: Record<string, unknown>;
  /** 게시물 관리: 금지품목 의심 메모 */
  bannedMemo?: string;
  /** 게시물 관리: 추천/인기 노출 여부 */
  isPromoted?: boolean;
  /** 판매자 공개 거래 단계 — posts.seller_listing_state */
  sellerListingState?: SellerListingState;
}

/** 13단계: 관리자 상품 상태 변경 이력 */
export interface ProductStatusLog {
  id: string;
  productId: string;
  fromStatus: ProductStatus;
  toStatus: ProductStatus;
  actionType: string;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}
