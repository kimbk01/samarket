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
