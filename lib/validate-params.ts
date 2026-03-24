/**
 * URL/라우트 파라미터 검증 유틸
 * - XSS/경로 조작 방지를 위해 id, slug, roomId 등은 허용 문자만 허용
 */

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_LENGTH = 128;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LENGTH;
}

/**
 * 상품/엔티티 id 검증 (예: products/[id])
 * @returns 정규화된 id 또는 null (잘못된 경우)
 */
export function parseId(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  return ID_PATTERN.test(value) ? value : null;
}

/**
 * 상점 slug 검증 (예: shop/[slug])
 */
export function parseSlug(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  return SLUG_PATTERN.test(value) ? value : null;
}

/**
 * 채팅방 id 검증 (예: chats/[roomId])
 */
export function parseRoomId(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  return ROOM_ID_PATTERN.test(value) ? value : null;
}
