/**
 * MEMBER ADDRESS LOCATION SSOT (server) — 2026-11-09 Owner 「주소 SSOT 1단계」.
 *
 * 회원 주소 한 행의 위치값(시/군 · 앱 지역 ID · LGU)을 만드는 **유일한** 함수.
 * - 저장(create/update/대표 지정): 앱 지역 ID·LGU 를 행에 기록한다. 시/군 칸(표시 필드)은 화면 입력값 그대로 둔다.
 * - 조회(listUserAddresses → address-defaults · 서버 화면): 비어 있는 칸만 이 결과로 채워 내려준다(DB 쓰기 없음).
 * 홈 헤더·커뮤니티(동네·글 지역)·거래·내정보·배달은 모두 이 값이 채워진 DTO 만 읽는다.
 *
 * 규칙
 * - 시/군: 저장된 값(Google locality) 우선. 없으면 주소 문장을 쉼표로 나눠 **오른쪽부터** 공식 LGU 표에
 *   유일하게 맞는 구간을 쓴다(「…, Quiapo, Manila, 1001 Metro Manila」→ Manila). 맞는 게 없으면 null(추정 없음).
 * - 앱 지역 ID: 주소 문장으로 다시 계산한다(화면이 보낸 ID·예전 ID 는 계산 실패 때만 사용).
 * - LGU: 저장된 값 우선, 없으면 시/군 + 도로 공식 표에서 유일할 때만.
 */
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { resolveCanonicalLguIdForAddressWrite } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";

export type AddressLocationInput = Pick<
  UserAddressDTO,
  | "appRegionId"
  | "appCityId"
  | "neighborhoodName"
  | "fullAddress"
  | "formattedAddress"
  | "roadAddress"
  | "buildingName"
  | "landmark"
  | "barangay"
  | "district"
  | "cityMunicipality"
  | "province"
  | "streetAddress"
> & { canonicalLguId?: string | null };

export type DerivedAddressLocation = {
  cityMunicipality: string | null;
  appRegionId: string | null;
  appCityId: string | null;
  canonicalLguId: string | null;
};

const COUNTRY_RE = /^(philippines|the philippines|republic of the philippines|필리핀|ph)$/i;

/** DB·클라이언트가 남긴 문자 "null"/"undefined" 는 빈 값 */
export function cleanAddressText(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "null" || lower === "undefined") return "";
  return t;
}

/**
 * 주소 문장에서 시/군 이름을 공식 LGU 표로만 찾는다 (오른쪽 구간부터).
 * 우편번호 구간(`1001 Metro Manila`)은 숫자를 떼고 본다. 유일하게 맞지 않으면 null.
 */
export function deriveCityMunicipalityFromAddressText(
  lines: Array<string | null | undefined>,
  province?: string | null,
): string | null {
  const prov = cleanAddressText(province) || null;
  for (const raw of lines) {
    // 줄바꿈도 구간 구분자 — 공백 정리(cleanAddressText)를 먼저 하면 「…\nQuezon City」가 한 구간으로 붙는다(2026-11-09 aa44 등 4건)
    if (!cleanAddressText(raw)) continue;
    const segments = String(raw)
      .split(/[,\n]/)
      .map((x) => x.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((x) => !COUNTRY_RE.test(x))
      .map((x) => x.replace(/^\d{4}\s+/, "").trim())
      .filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!;
      if (/\d/.test(seg)) continue;
      if (resolveCanonicalLguIdForAddressWrite({ cityMunicipality: seg, province: prov })) return seg;
    }
  }
  return null;
}

/** 행 한 건의 위치값 — 저장·조회 공통 */
export function deriveAddressLocation(input: AddressLocationInput): DerivedAddressLocation {
  const textLines = [input.formattedAddress, input.fullAddress, input.roadAddress];
  const cityMunicipality =
    cleanAddressText(input.cityMunicipality) ||
    deriveCityMunicipalityFromAddressText(textLines, input.province) ||
    null;

  const clean = (v: string | null | undefined) => cleanAddressText(v) || null;
  const fromText = mapUserAddressToAppLocation({
    appRegionId: null,
    appCityId: null,
    neighborhoodName: clean(input.neighborhoodName),
    fullAddress: clean(input.fullAddress),
    formattedAddress: clean(input.formattedAddress),
    roadAddress: clean(input.roadAddress),
    buildingName: clean(input.buildingName),
    landmark: clean(input.landmark),
    barangay: clean(input.barangay),
    district: clean(input.district),
    cityMunicipality,
    province: clean(input.province),
    streetAddress: clean(input.streetAddress),
  });
  const fallback = fromText
    ? null
    : mapUserAddressToAppLocation({
        appRegionId: clean(input.appRegionId),
        appCityId: clean(input.appCityId),
        neighborhoodName: null,
        fullAddress: null,
        formattedAddress: null,
        roadAddress: null,
        buildingName: null,
        landmark: null,
        barangay: null,
        district: null,
        cityMunicipality: null,
        province: null,
        streetAddress: null,
      });
  const taxonomy = fromText ?? fallback;

  const canonicalLguId =
    cleanAddressText(input.canonicalLguId) ||
    resolveCanonicalLguIdForAddressWrite({ cityMunicipality, province: clean(input.province) }) ||
    null;

  return {
    cityMunicipality,
    appRegionId: taxonomy?.regionId ?? null,
    appCityId: taxonomy?.cityId ?? null,
    canonicalLguId,
  };
}

/**
 * 조회용 — DB 쓰기 없음.
 * - `cityMunicipality`(표시 필드)는 바꾸지 않는다 — 위치 시/군은 `locationCityMunicipality` 로만 내보낸다
 *   (표시 필드를 채우면 FULL 주소가 「…, Manila」로 줄어 도로·동네가 빠지는 회귀).
 * - LGU: 저장값 우선, 비어 있을 때만 계산값.
 * - 앱 지역 ID: 주소 문장 계산값 우선(예전 우편번호 표로 잘못 저장된 ID 를 화면에 내보내지 않음), 계산 실패 때만 저장값.
 * 2026-04 폼으로 시/군 없이 저장된 행(운영 대표 17건)도 모든 화면에서 같은 값으로 읽힌다.
 */
export function withDerivedAddressLocation<T extends UserAddressDTO>(dto: T): T {
  const d = deriveAddressLocation(dto);
  const hasLgu = Boolean(cleanAddressText(dto.canonicalLguId));
  return {
    ...dto,
    locationCityMunicipality: d.cityMunicipality,
    appRegionId: d.appRegionId,
    appCityId: d.appCityId,
    canonicalLguId: hasLgu ? dto.canonicalLguId : d.canonicalLguId,
  };
}
