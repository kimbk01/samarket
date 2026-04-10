/** 주소 이름(이름 필드) 비교 — 앞뒤 공백·연속 공백 정리, 대소문자 무시 */
export function normalizeAddressNicknameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
