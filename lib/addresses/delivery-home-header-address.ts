/**
 * CONTRACT — 배달 홈(`/stores`) 헤더·주소 시트 표시 줄.
 * DO NOT: Google `formattedAddress`/`roadAddress` 만으로 헤더 채우기 — `userEnteredDetailLine` 우선.
 * DO NOT: 헤더 버튼에 `store_address_manage_link` — `delivery-home-header-label.ts`.
 */
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { formatUserAddressListPlainLine } from "@/lib/addresses/format-user-address-list-line";

function isDisplayNullish(s: string | null | undefined): boolean {
  const t = s?.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return lower === "null" || lower === "undefined";
}

function joinParts(parts: (string | null | undefined)[]): string | null {
  const out = parts.map((x) => x?.trim()).filter((x) => x && !isDisplayNullish(x)) as string[];
  if (out.length === 0) return null;
  return out.join(" ");
}

/** 동·마을 — 행정 구역(시·주) 제외 */
function resolveNeighborhoodLabel(a: UserAddressDTO): string | null {
  return a.neighborhoodName?.trim() || a.barangay?.trim() || null;
}

/**
 * 사용자가 직접 입력한 상세만 — Google Places `roadAddress`·`formattedAddress`·`fullAddress` 는 제외.
 */
function userEnteredDetailLine(a: UserAddressDTO): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of [a.detailAddress, a.unitFloorRoom, a.buildingName, a.streetAddress]) {
    const p = raw?.trim();
    if (!p || isDisplayNullish(p)) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(p);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/**
 * 배달 홈 헤더 — 배민식 세부 주소 (동 + 사용자 상세).
 * Google 지정 한 줄 주소는 표시하지 않는다.
 */
export function buildDeliveryHomeHeaderAddressLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a?.id) return null;

  const neighborhood = resolveNeighborhoodLabel(a);
  const detail = userEnteredDetailLine(a);
  const combined = joinParts([neighborhood, detail]);
  if (combined) return combined;

  return neighborhood || detail;
}

/**
 * 배달 홈 헤더·주소 시트 — 표시용 한 줄 (동일 규칙).
 * PH: `formatPhAddressCardOneLinePlain` (`AddressListRowBody`·주소 시트) 우선.
 * 카드가 비어 있으면 Baemin형 동·상세 → detailAddress → plain fallback.
 */
export function resolveDeliveryHomeHeaderDisplayLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a?.id) return null;

  const isPh = (a.countryCode ?? "PH").trim().toUpperCase() === "PH";
  if (isPh) {
    const phCard = normalizeDeliveryHomeHeaderDisplayLine(formatUserAddressListPlainLine(a));
    if (phCard) return phCard;
  }

  const primary = buildDeliveryHomeHeaderAddressLine(a);
  if (primary?.trim()) return primary.trim();

  const detail = a.detailAddress?.trim();
  if (detail && !isDisplayNullish(detail)) return detail;

  const plain = normalizeDeliveryHomeHeaderDisplayLine(formatUserAddressListPlainLine(a));
  if (plain) return plain;

  return null;
}

function pickDefaultAddressRow(
  row: UserAddressDTO | null | undefined
): UserAddressDTO | null {
  return row?.id ? row : null;
}

/** 배달 기본(`is_default_delivery`)만. master/trade/life 로 대체하지 않는다. */
export function pickDeliveryHomeHeaderAddress(
  defaults: UserAddressDefaultsDTO | null | undefined
): UserAddressDTO | null {
  if (!defaults) return null;
  return pickDefaultAddressRow(defaults.delivery);
}

function isHeaderDisplayPlaceholderLine(line: string | null | undefined): boolean {
  const t = line?.trim();
  if (!t) return true;
  return t === "—" || t === "-" || t === "주소 미입력";
}

/** 헤더·훅 — 카드 placeholder(`—`) 는 미표시로 간주 */
export function normalizeDeliveryHomeHeaderDisplayLine(line: string | null | undefined): string | null {
  if (isHeaderDisplayPlaceholderLine(line)) return null;
  return line!.trim();
}

export type DeliveryHomeHeaderAddressState =
  | { status: "loading" }
  | { status: "ready"; line: string | null; hasLinkedAddress: boolean };
