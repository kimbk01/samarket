/** 채팅 목록·IN 절 청크 — 무제한 스캔 방지 (미읽음 합계 API와 별도) */

export const CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT = 200;

/** 관리자 레거시 product_chats 목록 — 전체 스캔 방지 */
export const ADMIN_LEGACY_PRODUCT_CHAT_LIST_LIMIT = 200;

/** PostgREST in() URL 길이·플래너 부담 완화 */
export const CHAT_ROOM_ID_IN_CHUNK_SIZE = 120;

export function chunkIds(ids: string[], size: number): string[][] {
  const u = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  const out: string[][] = [];
  for (let i = 0; i < u.length; i += size) out.push(u.slice(i, i + size));
  return out;
}
