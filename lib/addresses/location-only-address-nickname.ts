/** DB `nickname` — 지정 이름(우리집·회사 등)을 비우고 위치만 남길 때, 행마다 고유한 내부 키로 쓴다. */
export const LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX = "__sam_loc:";
/** Create 시점에는 행 id가 없어 API nickname 필수 제약을 통과하기 위한 임시 키. 표시 제목으로 쓰지 않는다. */
export const LOCATION_ONLY_PENDING_NICKNAME_PREFIX = "__sam_tmp:";

export function encodeLocationOnlyAddressNickname(addressId: string): string {
  const id = addressId.trim();
  if (!id) throw new Error("missing_address_id");
  return `${LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX}${id}`;
}

export function encodePendingLocationOnlyNickname(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `t${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${LOCATION_ONLY_PENDING_NICKNAME_PREFIX}${id}`;
}

export function isLocationOnlyAddressNickname(n: string | null | undefined): boolean {
  const t = (n ?? "").trim();
  return (
    t.startsWith(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX) ||
    t.startsWith(LOCATION_ONLY_PENDING_NICKNAME_PREFIX)
  );
}

/** `__sam_loc:{id}` 에서 id 부분만 추출. 형식이 아니면 null */
export function decodeLocationOnlyAddressNicknameId(n: string | null | undefined): string | null {
  const t = (n ?? "").trim();
  if (!t.startsWith(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX)) return null;
  const id = t.slice(LOCATION_ONLY_ADDRESS_NICKNAME_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}
