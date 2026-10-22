/**
 * ORD-C-07 (클라이언트) — 주문 POST 멱등 키를 매장+주문 입력 fingerprint 단위로 localStorage 에 보관.
 * 장바구니(`store-commerce-cart-storage`, localStorage)와 같은 저장소 — Android WebView 프로세스 종료·앱 재시작 후에도
 * 장바구니와 함께 남아야 하므로 sessionStorage 를 쓰지 않는다. 로그아웃·계정 전환 시 장바구니와 함께 지운다.
 * 응답 유실·앱 재시작 후 같은 장바구니·같은 입력으로 다시 주문하면 같은 키를 재사용해
 * 서버 멱등(`client_order_key`)이 첫 주문을 돌려준다. 서버는 키를 필수로 요구하지 않는다(변경 없음).
 *
 * - fingerprint 가 다르면(장바구니·쿠폰·상품권·주소 등 변경) 재사용하지 않는다.
 * - 성공·서버 명시 실패 시 삭제. 네트워크 오류 시 유지.
 * - 저장소 접근 실패는 메모리 키(ref)만으로 동작(기존 동작).
 * - 서버 멱등은 buyer_user_id + key 단위라 다른 계정이 같은 키를 보내도 다른 주문으로 처리된다.
 */

const STORAGE_PREFIX = "dibay:store_order_pending_key:v1:";
/** 장바구니 TTL(24h)과 같은 상한 — 오래된 키는 무시 */
const PENDING_KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingEntry = { fingerprint: string; key: string; savedAtMs: number };

function storageKey(storeId: string): string {
  return `${STORAGE_PREFIX}${storeId.trim()}`;
}

export function readPendingStoreOrderClientKey(
  storeId: string,
  fingerprint: string,
  nowMs: number = Date.now()
): string | null {
  const sid = storeId.trim();
  if (!sid || !fingerprint) return null;
  try {
    const raw = localStorage.getItem(storageKey(sid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingEntry> | null;
    if (
      !parsed ||
      typeof parsed.key !== "string" ||
      !parsed.key ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.savedAtMs !== "number" ||
      nowMs - parsed.savedAtMs > PENDING_KEY_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed.key;
  } catch {
    return null;
  }
}

export function writePendingStoreOrderClientKey(
  storeId: string,
  fingerprint: string,
  key: string,
  nowMs: number = Date.now()
): void {
  const sid = storeId.trim();
  if (!sid || !fingerprint || !key) return;
  try {
    const entry: PendingEntry = { fingerprint, key, savedAtMs: nowMs };
    localStorage.setItem(storageKey(sid), JSON.stringify(entry));
  } catch {
    /* 저장 불가(프라이빗 모드 등) — 메모리 키만 사용 */
  }
}

export function clearPendingStoreOrderClientKey(storeId: string): void {
  const sid = storeId.trim();
  if (!sid) return;
  try {
    localStorage.removeItem(storageKey(sid));
  } catch {
    /* ignore */
  }
}

/** 로그아웃·계정 전환 — 모든 매장의 대기 키 제거 (`clearCommerceCartStorage` 에서 호출) */
export function clearAllPendingStoreOrderClientKeys(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
