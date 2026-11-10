/**
 * 구글 결과(한국어) → 한국 주소 초안 — 한국 주소 지원 1단계 (Owner 2026-11-10 「시안대로 구현」).
 *
 * 저장 칸 대응 (기존 칸 그대로 · 새 칸 없음):
 *   province          ← 시도(현행 이름: 「서울특별시」)
 *   city_municipality ← 시/군/자치구 이름(「강남구」·「수원시」)
 *   barangay          ← 동·읍·면(「역삼동」) — 칸 이름은 필리핀식이지만 같은 「동네」 단계
 *   street_address / formatted_address ← 도로명 주소 한 줄(「서울특별시 강남구 테헤란로 152」, 「대한민국」 제외)
 *   canonical_lgu_id  ← 서버가 `KR:` + 시/군/구 코드로 정한다(`address-location-ssot.server`)
 * 판정은 공식 시/군/구 표(`kr-sigungu`)로만 — 맞지 않으면 시/군 칸을 비워 저장 단계에서 막는다(추정 금지).
 */
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { fetchPlaceDetailsAsLegacyPlaceResult, PLACE_FIELDS_POI_FULL } from "@/lib/map/places-new-api";
import { normalizeKrSido, resolveKrSigunguCode } from "@/lib/addresses/kr/kr-sigungu";
import data from "@/data/kr-sigungu/kr-sigungu.json";

type Comp = google.maps.GeocoderAddressComponent;

const KR_LOCALE = { language: "ko", region: "KR" } as const;
const UNITS = (data as { units: Array<{ code: string; name: string }> }).units;

function clean(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

function pick(components: Comp[], type: string): string | null {
  for (const c of components) {
    if (c.types?.includes(type) && clean(c.long_name)) return clean(c.long_name);
  }
  return null;
}

/** 「대한민국 서울특별시 강남구 테헤란로 152」 → 「서울특별시 강남구 테헤란로 152」 */
export function stripKoreaCountry(line: string | null | undefined): string {
  return clean(line)
    .replace(/^(대한민국|South Korea|Korea|Republic of Korea)\s*/i, "")
    .replace(/,?\s*(대한민국|South Korea)$/i, "")
    .trim();
}

export type KrParsed = {
  sido: string | null;
  sigunguCode: string | null;
  sigunguName: string | null;
  dong: string | null;
  roadLine: string;
  postalCode: string | null;
};

export function parseKrGoogleAddress(components: Comp[], formatted: string | null | undefined): KrParsed {
  const roadLine = stripKoreaCountry(formatted);
  const tokens = roadLine.split(" ").filter(Boolean);
  const sido = normalizeKrSido(pick(components, "administrative_area_level_1")) ?? normalizeKrSido(tokens[0]);
  const sl1 = pick(components, "sublocality_level_1");
  const locality = pick(components, "locality");
  const aal2 = pick(components, "administrative_area_level_2");
  const sigunguCode = resolveKrSigunguCode({
    sido,
    names: [sl1, locality, aal2, tokens[1], tokens[2], tokens[1] && tokens[2] ? `${tokens[1]}${tokens[2]}` : null],
  });
  const sigunguName = sigunguCode ? UNITS.find((u) => u.code === sigunguCode)?.name ?? null : null;
  /** 동·읍·면 — 시/군/구 이름이 아닌 하위 단계 중 동/읍/면/가/리로 끝나는 첫 이름 */
  let dong: string | null = null;
  for (const t of ["sublocality_level_2", "sublocality_level_3", "sublocality_level_1", "neighborhood"]) {
    const v = pick(components, t);
    if (v && v !== sigunguName && /(동|읍|면|가|리)$/.test(v) && !/(구|시|군)$/.test(v)) {
      dong = v;
      break;
    }
  }
  return { sido, sigunguCode, sigunguName, dong, roadLine, postalCode: pick(components, "postal_code") };
}

function draftFromParsed(args: {
  parsed: KrParsed;
  latitude: number;
  longitude: number;
  placeId: string | null;
  placeName: string | null;
  placeTypes: string[];
}): CanonicalAddressDraft {
  const { parsed } = args;
  const name = clean(args.placeName);
  /** 장소 이름이 주소 자체(「테헤란로 152」)면 장소 이름으로 쓰지 않는다 */
  const placeName = name && !parsed.roadLine.includes(name) && !/^\d/.test(name) ? name : null;
  return {
    countryCode: "KR",
    latitude: args.latitude,
    longitude: args.longitude,
    placeId: placeName ? args.placeId : null,
    placeName,
    placeTypes: args.placeTypes,
    streetNumber: null,
    route: null,
    streetAddress: parsed.roadLine || null,
    barangay: parsed.dong,
    cityMunicipality: parsed.sigunguName,
    province: parsed.sido,
    postalCode: parsed.postalCode,
    neighborhoodName: null,
    formattedAddress: parsed.roadLine || null,
    identitySource: placeName ? "place_details" : "address_only",
    samePlaceAsPreferred: false,
  };
}

/**
 * 동·읍·면 보충 — 도로명 결과(구글)에는 동 칸이 없는 경우가 많다(실기 2026-11-10: 테헤란로 152 → 동 비어 저장).
 * 같은 좌표의 역지오코딩 결과 전체에서 동·읍·면 이름을 찾는다. 못 찾으면 null(추정 금지).
 */
export function findKrDongInResults(
  results: Array<{ address_components?: Comp[] | null }>,
  sigunguName: string | null
): string | null {
  const order = ["sublocality_level_2", "sublocality_level_3", "neighborhood", "sublocality_level_1"];
  for (const type of order) {
    for (const r of results) {
      const v = pick(r.address_components ?? [], type);
      if (v && v !== sigunguName && /(동|읍|면|가)$/.test(v) && !/(구|시|군)$/.test(v)) return v;
    }
  }
  return null;
}

async function reverseGeocodeKr(lat: number, lng: number): Promise<google.maps.GeocoderResult[]> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const resp = await geocoder.geocode({ location: { lat, lng }, language: KR_LOCALE.language, region: KR_LOCALE.region });
  return resp.results ?? [];
}

/** 검색 결과(장소 id) → 한국 주소 초안 (한국어 상세) */
export async function resolveKrDraftFromPlaceId(placeId: string): Promise<CanonicalAddressDraft | null> {
  const place = await fetchPlaceDetailsAsLegacyPlaceResult(placeId, PLACE_FIELDS_POI_FULL, KR_LOCALE);
  const loc = place?.geometry?.location;
  if (!place || !loc) return null;
  const parsed = parseKrGoogleAddress(place.address_components ?? [], place.formatted_address);
  if (!parsed.dong) {
    try {
      parsed.dong = findKrDongInResults(await reverseGeocodeKr(loc.lat(), loc.lng()), parsed.sigunguName);
    } catch {
      /** 동 보충 실패는 저장을 막지 않는다 — 동 없이 시/군/구까지만 */
    }
  }
  return draftFromParsed({
    parsed,
    latitude: loc.lat(),
    longitude: loc.lng(),
    placeId: (place.place_id ?? placeId).trim() || null,
    placeName: place.name ?? null,
    placeTypes: [...(place.types ?? [])],
  });
}

/** 지도 핀·현재 위치 → 한국 주소 초안 (도로명 결과 우선) */
export async function resolveKrPinDraft(lat: number, lng: number): Promise<CanonicalAddressDraft | null> {
  const results = await reverseGeocodeKr(lat, lng);
  const best =
    results.find((r) => r.types?.some((t) => t === "street_address" || t === "premise")) ?? results[0] ?? null;
  if (!best) return null;
  const parsed = parseKrGoogleAddress(best.address_components ?? [], best.formatted_address);
  if (!parsed.dong) parsed.dong = findKrDongInResults(results, parsed.sigunguName);
  return draftFromParsed({ parsed, latitude: lat, longitude: lng, placeId: null, placeName: null, placeTypes: [] });
}
