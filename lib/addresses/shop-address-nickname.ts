/** DB `nickname` — 매장 주소 행은 전역 닉네임 충돌을 피하기 위해 매장 UUID 기반으로 고정한다. */
const PREFIX = "매장:";

export function encodeShopAddressNickname(storeId: string): string {
  return `${PREFIX}${storeId.trim()}`;
}

/** `매장:{uuid}` → uuid, 아니면 null */
export function tryDecodeShopAddressStoreId(nickname: string | null | undefined): string | null {
  const s = (nickname ?? "").trim();
  if (!s.startsWith(PREFIX)) return null;
  const id = s.slice(PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : id.length > 0 ? id : null;
}
