/**
 * 거래 글쓰기 → 주소 관리로 이동했다가 돌아올 때만 sessionStorage 초안을 복원하기 위한 1회용 플래그.
 * 일반적으로 /write 로 들어오면 플래그가 없어 초안을 비우고 빈 폼으로 시작한다.
 */

const KEY_PREFIX = "samarket:trade-write-restore-after-address:v1";

function key(categoryId: string): string {
  return `${KEY_PREFIX}:${categoryId.trim()}`;
}

export function setTradeWriteRestoreAfterAddressFlag(categoryId: string): void {
  if (typeof window === "undefined" || !categoryId.trim()) return;
  try {
    sessionStorage.setItem(key(categoryId), "1");
  } catch {
    /* ignore */
  }
}

/** true 이면 플래그를 제거했다(이번 방문에서 복원 시도할 것). */
export function consumeTradeWriteRestoreAfterAddressFlag(categoryId: string): boolean {
  if (typeof window === "undefined" || !categoryId.trim()) return false;
  try {
    const k = key(categoryId);
    if (sessionStorage.getItem(k) !== "1") return false;
    sessionStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
