/**
 * posts 테이블 기준 타입 (Supabase 연동)
 * - status: active | reserved | sold (거래), hidden (관리자 숨김)
 */

export type PostStatus = "active" | "reserved" | "sold" | "hidden";
export type PostType = "trade" | "community" | "service" | "feature";

export type PostTradeType = "product" | "job";

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
  /** National Trade discovery LGU (PSGC). Independent of region/city local Area. */
  trade_lgu_id?: string | null;
  barangay: string | null;
  contact_method: string | null;
  status: PostStatus;
  /** 거래: 일반 상품 vs 일자리 */
  trade_type?: PostTradeType;
  job_employment_type?: string | null;
  job_category?: string | null;
  pay_type?: string | null;
  pay_amount?: number | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  work_days?: string[] | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  headcount?: number | null;
  experience_required?: string | null;
  application_count?: number;
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
  /** DB `user_id` (행 매핑 시 포함될 수 있음) */
  user_id?: string;
  /** 거래 서브카테고리 등 */
  trade_category_id?: string | null;
  category_name?: string;
  author_nickname?: string;
  author_avatar_url?: string;
  favorite_count?: number;
  comment_count?: number;
}
