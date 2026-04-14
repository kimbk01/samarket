/**
 * posts 테이블 PostgREST select 문자열 — `select('*')` 지양, 운영·보안·대역 공통 기준.
 * 목록용 컬럼은 `trade-posts-range-query` 와 동일 소스.
 */
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

export { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

/** IN 조인·구매/후기 등 content 불필요 경로 */
export const POST_TRADE_RELATION_SELECT = POST_TRADE_LIST_SELECT;

/** 채팅 시작 게이트 — relation 과 동일 (존재하지 않는 컬럼은 select 에 포함하지 않음) */
export const POST_TRADE_CHAT_GATE_SELECT = POST_TRADE_LIST_SELECT;

/** 상세 본문 포함 — `content` 만 추가 (barangay 등은 스키마에 없을 수 있어 목록 컬럼에 의존) */
export const POST_TRADE_DETAIL_SELECT = `${POST_TRADE_LIST_SELECT}, content`;

/**
 * 채팅 상단 카드 — 명시적 목록·상세 select 가 모두 실패할 때 `select('*')` 대신 시도.
 * (여전히 실패하면 `POST_TRADE_CHAT_BARE_MIN_SELECT` → null)
 */
export const POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT =
  "id, user_id, title, price, status, thumbnail_url, images, meta, region, city, created_at, updated_at, trade_category_id, board_id, service_id, visibility, reserved_buyer_id, author_nickname, seller_listing_state, content, description, district, sold_buyer_id";

/** 극단적 스키마 축소 시 — 카드·지역 라벨 일부만 희생하고 행 존재 여부 확보 */
export const POST_TRADE_CHAT_BARE_MIN_SELECT =
  "id, user_id, title, thumbnail_url, images, price, status, meta, created_at, updated_at, region, city";
