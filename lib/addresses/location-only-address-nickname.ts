/** DB `nickname` — 지정 이름(우리집·회사 등)을 비우고 위치만 남길 때, 행마다 고유한 내부 키로 쓴다. */
export const LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX = "__sam_loc:";

export function encodeLocationOnlyAddressNickname(addressId: string): string {
  const id = addressId.trim();
  if (!id) throw new Error("missing_address_id");
  return `${LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX}${id}`;
}

export function isLocationOnlyAddressNickname(n: string | null | undefined): boolean {
  return (n ?? "").trim().startsWith(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX);
}

/** `__sam_loc:{id}` 에서 id 부분만 추출. 형식이 아니면 null */
export function decodeLocationOnlyAddressNicknameId(n: string | null | undefined): string | null {
  const t = (n ?? "").trim();
  if (!t.startsWith(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX)) return null;
  const id = t.slice(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}
