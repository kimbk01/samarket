/**
 * Google Place Details `address_components` → `user_addresses` PH 필드 매핑 (감사 요약).
 *
 * | Google `types` (우선순) | DB 컬럼 | 비고 |
 * |-------------------------|---------|------|
 * | `sublocality_level_1`, `sublocality`, `neighborhood` | `barangay` | 첫 매칭 long_name |
 * | `locality`, `administrative_area_level_2` (보조) | `city_municipality` | locality 우선 |
 * | `administrative_area_level_1` | `province` | NCR·Metro Manila 등 |
 * | `route` + `street_number` | `street_address` (한 줄) | 번지+도로 |
 * | `premise`, `point_of_interest`, `establishment` | 보조 헤드라인 | `name`과 함께 landmark 후보 |
 * | `formatted_address` (원문) | `formatted_address` | 저장용 스냅샷 — UI 표시는 `ph-address-display` |
 * | Place `name` | `building_name` / 헤드라인 | 콘도·몰·단지명 |
 * | 사용자 입력 | `detail_address`, `landmark`, `delivery_note` | Place에서 오지 않음 |
 */

export type PhGooglePlaceParsed = {
  barangay: string | null;
  cityMunicipality: string | null;
  province: string | null;
  neighborhood: string | null;
  /** street_number + route */
  routeLine: string | null;
  /** POI / 건물 / 단지 상단명 */
  buildingOrPlaceHeadline: string | null;
};

function pickLongName(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string
): string | null {
  if (!components?.length) return null;
  for (const c of components) {
    if (c.types?.includes(type) && c.long_name?.trim()) {
      return c.long_name.trim();
    }
  }
  return null;
}

function pickFirstOfTypes(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  types: readonly string[]
): string | null {
  for (const t of types) {
    const v = pickLongName(components, t);
    if (v) return v;
  }
  return null;
}

/**
 * 레거시 `PlacesService#getDetails` 의 `PlaceResult` 에서 필리핀형 구조 필드를 추출한다.
 */
export function parsePhFromGooglePlaceResult(
  place: google.maps.places.PlaceResult | null | undefined
): PhGooglePlaceParsed {
  const ac = place?.address_components;
  const province = pickLongName(ac, "administrative_area_level_1");
  let cityMunicipality =
    pickLongName(ac, "locality") ||
    pickLongName(ac, "administrative_area_level_2") ||
    pickLongName(ac, "administrative_area_level_3");
  const barangay =
    pickFirstOfTypes(ac, [
      "sublocality_level_1",
      "sublocality_level_2",
      "sublocality",
      "neighborhood",
    ] as const) || null;
  const neighborhood = pickLongName(ac, "neighborhood");

  const streetNumber = pickLongName(ac, "street_number");
  const route = pickLongName(ac, "route");
  const routeLine = [streetNumber, route].filter(Boolean).join(" ").trim() || route || null;

  const premise = pickFirstOfTypes(ac, ["premise", "point_of_interest", "establishment"] as const);
  const name = (place?.name ?? "").trim() || null;
  const buildingOrPlaceHeadline = name || premise || null;

  if (!cityMunicipality && province && /metro\s*manila|^ncr$/i.test(province)) {
    cityMunicipality = pickLongName(ac, "locality") || barangay;
  }

  return {
    barangay,
    cityMunicipality: cityMunicipality?.trim() || null,
    province: province?.trim() || null,
    neighborhood: neighborhood?.trim() || null,
    routeLine: routeLine?.trim() || null,
    buildingOrPlaceHeadline: buildingOrPlaceHeadline?.trim() || null,
  };
}
