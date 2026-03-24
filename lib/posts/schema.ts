/**
 * posts 테이블 기준 타입 (Supabase 연동)
 * - status: active | reserved | sold (거래), hidden (관리자 숨김)
 */

export type PostStatus = "active" | "reserved" | "sold" | "hidden";
export type PostType = "trade" | "community" | "service" | "feature";

export interface PostRow {
  id: string;
  category_id: string;
  author_id: string;
  type: PostType;
  title: string;
  content: string;
  price: number | null;
  is_price_offer: boolean;
  is_free_share: boolean;
  region: string | null;
  city: string | null;
  barangay: string | null;
  contact_method: string | null;
  status: PostStatus;
  /** 판매자 공개 거래 단계 (마이그레이션 전 DB에는 없을 수 있음) */
  seller_listing_state?: string;
  /** 예약중일 때 확정 구매자 (마이그레이션 전 DB에는 없을 수 있음) */
  reserved_buyer_id?: string | null;
  view_count: number;
  thumbnail_url: string | null;
  images: string[] | null;
  /** 거래 종류별 확장 데이터 (부동산: 보증금/월세, 중고차: 차종/주행 등) */
  meta?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PostWithMeta extends PostRow {
  category_name?: string;
  author_nickname?: string;
  author_avatar_url?: string;
  favorite_count?: number;
  comment_count?: number;
}
