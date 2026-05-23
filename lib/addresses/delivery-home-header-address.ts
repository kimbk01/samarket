/**
 * CONTRACT — 배달 홈(`/stores`) 헤더·주소 시트 표시 줄.
 * DO NOT: Google `formattedAddress`/`roadAddress` 만으로 헤더 채우기 — `userEnteredDetailLine` 우선.
 * DO NOT: 헤더 버튼에 `store_address_manage_link` — `delivery-home-header-label.ts`.
 */
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import {
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";

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
 * 배달 홈 헤더·주소 시트 — 표시용 한 줄.
 * Baemin형 동·상세 우선, 없으면 detailAddress → PH 카드 → 주소관리 본문 순.
 */
export function resolveDeliveryHomeHeaderDisplayLine(a: UserAddressDTO | null | undefined): string | null {
  if (!a?.id) return null;

  const primary = buildDeliveryHomeHeaderAddressLine(a);
  if (primary?.trim()) return primary.trim();

  const detail = a.detailAddress?.trim();
  if (detail && !isDisplayNullish(detail)) return detail;

  const isPh = (a.countryCode ?? "PH").trim().toUpperCase() === "PH";
  if (isPh) {
    const ph = formatPhAddressCardOneLinePlain(a).trim();
    if (ph && ph !== "주소 미입력") return ph;
  }

  const mgmt = stripCountryFromAddressDisplayLine(
    buildAddressManagementListPrimaryLine(a),
    a.countryName,
  ).trim();
  if (mgmt && mgmt !== "주소 미입력") return mgmt;

  return null;
}

/** 배달 기본 → master 순 (주소 관리 defaults API 와 동일) */
export function pickDeliveryHomeHeaderAddress(
  defaults: UserAddressDefaultsDTO | null | undefined
): UserAddressDTO | null {
  if (!defaults) return null;
  const delivery = defaults.delivery?.id ? defaults.delivery : null;
  const master = defaults.master?.id ? defaults.master : null;
  return delivery ?? master;
}

export type DeliveryHomeHeaderAddressState =
  | { status: "loading" }
  | { status: "ready"; line: string | null; hasLinkedAddress: boolean };
