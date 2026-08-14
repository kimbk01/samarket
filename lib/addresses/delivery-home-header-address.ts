/**
 * CONTRACT — 배달 홈(`/stores`) 헤더 칩.
 * 화면 칩은 대표 주소(`isDefaultMaster`) SHORT 줄.
 * `isDefaultDelivery` 는 주문 결제 라디오 기본값 전용.
 * DO NOT: 헤더 버튼에 `store_address_manage_link` — `delivery-home-header-label.ts`.
 */
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { resolveCanonicalChipLineFromDto } from "@/lib/addresses/canonical-address-display";

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
 * 배달 홈 헤더 칩 — SHORT (상호/건물명, 없으면 Subdivision/Village).
 */
export function resolveDeliveryHomeHeaderDisplayLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a?.id) return null;
  return normalizeDeliveryHomeHeaderDisplayLine(resolveCanonicalChipLineFromDto(a));
}

function pickDefaultAddressRow(
  row: UserAddressDTO | null | undefined
): UserAddressDTO | null {
  return row?.id ? row : null;
}

/** 화면 칩은 대표 주소(`isDefaultMaster`). delivery/trade/life 로 대체하지 않는다. */
export function pickDeliveryHomeHeaderAddress(
  defaults: UserAddressDefaultsDTO | null | undefined
): UserAddressDTO | null {
  if (!defaults) return null;
  return pickDefaultAddressRow(defaults.master);
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
