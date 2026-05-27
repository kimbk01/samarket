import type { AddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildTradePublicLine, stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import { parseLatLngRow } from "@/lib/map/initial-trade-meet-spot-center";

/** API·캐시 JSON — camelCase DTO 또는 DB snake row */
function coerceAddressRow(raw: unknown): UserAddressDTO | null {
  return coerceUserAddressDTO(raw);
}

/**
 * `pickTradeMeetSpotCenterFromAddressDefaults` 와 **같은 키 순서**(master→trade→life→delivery).
 * 1) 위경도가 있는 **첫** 행 — 지도 초기 핀과 동일 출처 → 표시 한 줄·저장 문구 정합.
 * 2) 없으면 id 가 있는 첫 행 — 좌표는 없어도 `buildTradePublicLine` 으로 쓸 수 있을 때.
 */
export function pickUserAddressRowAlignedWithMeetSpotPin(
  defaults: AddressDefaultsSnapshot["defaults"]
): UserAddressDTO | null {
  if (!defaults) return null;
  const keys = ["master", "trade", "life", "delivery"] as const;
  const bag = defaults as Record<string, unknown>;
  for (const k of keys) {
    const row = coerceAddressRow(bag[k] ?? null);
    if (!row?.id) continue;
    if (parseLatLngRow(row)) return row;
  }
  for (const k of keys) {
    const row = coerceAddressRow(bag[k] ?? null);
    if (row?.id) return row;
  }
  return null;
}

export function buildTradeMeetFallbackLineFromAddressDTO(a: UserAddressDTO): string | null {
  const line = stripCountryFromAddressDisplayLine(buildTradePublicLine(a), a.countryName).trim();
  if (!line || line === "주소 미입력") return null;
  return line;
}

/** 글쓰기 거래 희망 장소 미지정 시 — 지도 핀과 동일 우선순위 주소 행의 공개 한 줄 */
export async function fetchRepresentativeTradeMeetFallbackLine(): Promise<string | null> {
  const snap = await fetchAddressDefaultsSnapshot();
  if (!snap?.ok || !snap.defaults) return null;
  const addr = pickUserAddressRowAlignedWithMeetSpotPin(snap.defaults);
  if (addr?.id) {
    const line = buildTradeMeetFallbackLineFromAddressDTO(addr);
    if (line) return line;
  }
  return snap.neighborhoodFromLife?.label?.trim() || null;
}
