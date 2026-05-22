import { stripStoreDetailFromGoogleStreetLine } from "@/lib/stores/normalize-store-address-ph";
import {
  dedupeAdjacentRepeatedStreetPhrase,
  dedupePhCommaDuplicateHead,
} from "@/lib/addresses/ph-address-display";

export type StoreOrderDeliveryAddressParts = {
  /** 동·호·층 등 — 카드 `gatePrefix` */
  gatePrefix: string;
  /** 도로·구글 가로 줄 — 카드 `streetBody` */
  streetBody: string;
  /** 비PH·레거시용 별도 상세 줄(이미 street 에 없을 때만) */
  detailLine: string | null;
};

function normComparable(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function detailEmbeddedInStreet(street: string, detail: string): boolean {
  const sl = normComparable(street);
  const dl = normComparable(detail);
  if (!dl) return true;
  if (!sl) return false;
  return sl === dl || sl.startsWith(`${dl},`) || sl.startsWith(`${dl}，`) || sl.includes(dl);
}

/**
 * `store_orders.delivery_address_summary` + `delivery_address_detail` → 주소 관리 PH 카드와 동일 분해.
 * - summary ≈ address1(가로), detail ≈ address2(상세)
 * - 레거시(상세가 summary 에 중복·한 줄에 detail+street)도 dedupe
 */
export function formatStoreOrderDeliveryAddressParts(input: {
  summary?: string | null;
  detail?: string | null;
}): StoreOrderDeliveryAddressParts {
  const summaryRaw = input.summary?.trim() ?? "";
  const detailRaw = input.detail?.trim() ?? "";

  let streetBody = summaryRaw
    ? dedupeAdjacentRepeatedStreetPhrase(dedupePhCommaDuplicateHead(summaryRaw))
    : "";
  let gatePrefix = detailRaw;

  if (streetBody && gatePrefix) {
    const stripped = stripStoreDetailFromGoogleStreetLine(streetBody, gatePrefix);
    streetBody = stripped ?? streetBody;
  }

  if (gatePrefix && detailEmbeddedInStreet(streetBody, gatePrefix)) {
    gatePrefix = "";
  }

  /** summary 한 줄에 `상세, 가로` 가 함께 저장된 레거시 */
  if (!gatePrefix && streetBody.includes(",")) {
    const commaParts = streetBody.split(",").map((p) => p.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      const head = commaParts[0];
      const tail = commaParts.slice(1).join(", ");
      if (head.length <= 48 && head.length >= 2 && !detailEmbeddedInStreet(tail, head)) {
        gatePrefix = head;
        streetBody = dedupeAdjacentRepeatedStreetPhrase(dedupePhCommaDuplicateHead(tail));
      }
    }
  }

  /** PH 카드는 `gatePrefix`+`streetBody` 인라인 — 별도 라벨 줄은 가로 줄 없이 상세만 있을 때 */
  const detailLine = !streetBody && gatePrefix ? gatePrefix : null;

  return {
    gatePrefix,
    streetBody,
    detailLine,
  };
}

/** 사장님·라이더·채팅 카드 한 줄 — `상세, 도로` (PH 카드 규칙) */
export function formatStoreOrderDeliveryAddressPlain(input: {
  summary?: string | null;
  detail?: string | null;
}): string {
  const { gatePrefix, streetBody } = formatStoreOrderDeliveryAddressParts(input);
  if (gatePrefix && streetBody) return `${gatePrefix}, ${streetBody}`;
  return gatePrefix || streetBody || "";
}

/** 확인 모달·복사용 여러 줄(중복 상세 생략) */
export function formatStoreOrderDeliveryAddressMultiline(input: {
  summary?: string | null;
  detail?: string | null;
}): string {
  const plain = formatStoreOrderDeliveryAddressPlain(input);
  return plain || "—";
}
