/**
 * 장바구니 배달용 배송지 목록 (브라우저 localStorage).
 * 선택된 항목이 주문 API delivery_address_* 로 전달됩니다.
 */

export type DeliveryAddressBookEntry = {
  id: string;
  /** 표시용 슬롯 이름(예: 배달주소 1). 목록 순서와 함께 쓰입니다. */
  label: string;
  region: string;
  city: string;
  freeSummaryLine: string;
  addressDetail: string;
};

const STORAGE_KEY = "kasama_checkout_delivery_address_book_v1";

/** entries에 넣지 않는 마이페이지 주소를 라디오 선택값으로 쓸 때의 selectedId */
export const PROFILE_DELIVERY_SELECTION_ID = "__kasama_profile_delivery__";

type StoredShape = {
  entries: DeliveryAddressBookEntry[];
  selectedId: string | null;
};

function isEntry(x: unknown): x is DeliveryAddressBookEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.region === "string" &&
    typeof o.city === "string" &&
    typeof o.freeSummaryLine === "string" &&
    typeof o.addressDetail === "string"
  );
}

export function newDeliveryAddressId(): string {
  return `addr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadDeliveryAddressBook(): { entries: DeliveryAddressBookEntry[]; selectedId: string | null } {
  if (typeof window === "undefined") {
    return { entries: [], selectedId: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], selectedId: null };
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || !Array.isArray((o as StoredShape).entries)) {
      return { entries: [], selectedId: null };
    }
    const entries = (o as StoredShape).entries.filter(isEntry);
    const selectedId =
      typeof (o as StoredShape).selectedId === "string"
        ? (o as StoredShape).selectedId
        : entries[0]?.id ?? null;
    const validSelected =
      selectedId === PROFILE_DELIVERY_SELECTION_ID
        ? selectedId
        : entries.some((e) => e.id === selectedId)
          ? selectedId
          : entries[0]?.id ?? null;
    return { entries, selectedId: validSelected };
  } catch {
    return { entries: [], selectedId: null };
  }
}

export function saveDeliveryAddressBook(
  entries: DeliveryAddressBookEntry[],
  selectedId: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredShape = { entries, selectedId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
