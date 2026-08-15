/**
 * 글쓰기 공통 payload (category type + settings 기반)
 */

import type { TradeJobColumnPayload } from "@/lib/posts/trade-job-db-fields";

export type PostType = "trade" | "community" | "service" | "feature";

export interface CreatePostPayloadBase {
  categoryId: string;
  type: PostType;
  title: string;
  content: string;
}

export interface CreatePostPayloadTrade extends CreatePostPayloadBase {
  type: "trade";
  price?: number | null;
  isPriceOfferEnabled?: boolean;
  isFreeShare?: boolean;
  region?: string;
  city?: string;
  /** National PSGC LGU snapshot — N3 write cutover; typed for N2 plumbing only */
  tradeLguId?: string;
  barangay?: string;
  /** 업로드 후 받은 이미지 URL (첫 URL이 썸네일) */
  imageUrls?: string[];
  /** 거래 종류별 확장 데이터 (부동산/중고차/알바/환전 스킨용) */
  meta?: Record<string, unknown>;
  /** 일자리: DB 컬럼 동기화 (meta 와 병행) */
  tradeJob?: TradeJobColumnPayload;
}

export interface CreatePostPayloadCommunity extends CreatePostPayloadBase {
  type: "community";
}

export interface CreatePostPayloadService extends CreatePostPayloadBase {
  type: "service";
  /** 요청형일 때 연락 방법 */
  contactMethod?: string;
  region?: string;
  city?: string;
  barangay?: string;
}

export interface CreatePostPayloadFeature extends CreatePostPayloadBase {
  type: "feature";
}

export type CreatePostPayload =
  | CreatePostPayloadTrade
  | CreatePostPayloadCommunity
  | CreatePostPayloadService
  | CreatePostPayloadFeature;

export interface CreatePostResult {
  ok: true;
  id: string;
}

export interface CreatePostError {
  ok: false;
  error: string;
}

export type CreatePostResponse = CreatePostResult | CreatePostError;
