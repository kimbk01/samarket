/**
 * EXPERIMENTAL — Places API (New) via JS SDK `google.maps.places.Place`
 * (`Place.searchNearby`, `Place` + `fetchFields`).
 *
 * - 프로덕션·기존 `places-new-api`(PlacesService) 경로와 무관.
 * - UI/MapPicker와 연결하지 않음. 실패해도 앱 기능에 영향 없음.
 *
 * 브라우저 콘솔에서 동적 import 후 실행 예:
 *
 * ```ts
 * void import("@/lib/map/places-new-experimental").then((m) =>
 *   m.experimentalPlacesRunConsoleSelfTest()
 * );
 * ```
 */

import { loadGoogleMaps } from "@/lib/map/load-google-maps";

export type ExperimentalPlacesSearchNearbySummary = {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
};

export type ExperimentalPlacesSearchNearbyResult = {
  ok: boolean;
  placeCount: number;
  summaries: ExperimentalPlacesSearchNearbySummary[];
  error?: string;
};

/**
 * `Place.searchNearby` — Places(New) RPC 경로로 근처 장소 조회(실험).
 */
export async function experimentalPlacesSearchNearbyTest(
  center: google.maps.LatLngLiteral,
  radiusMeters: number
): Promise<ExperimentalPlacesSearchNearbyResult> {
  if (typeof window === "undefined") {
    return { ok: false, placeCount: 0, summaries: [], error: "browser_only" };
  }
  try {
    await loadGoogleMaps();
    const placesLib = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
    const PlaceCtor = placesLib.Place;
    const RankPref = placesLib.SearchNearbyRankPreference;

    const req: google.maps.places.SearchNearbyRequest = {
      fields: ["id", "displayName", "formattedAddress", "location"],
      locationRestriction: { center, radius: radiusMeters },
      maxResultCount: 10,
      rankPreference: RankPref.DISTANCE,
    };

    const { places } = await PlaceCtor.searchNearby(req);
    const list = places ?? [];
    const summaries: ExperimentalPlacesSearchNearbySummary[] = list.map((p) => ({
      id: p.id,
      displayName: p.displayName ?? null,
      formattedAddress: p.formattedAddress ?? null,
    }));

    return { ok: true, placeCount: summaries.length, summaries };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, placeCount: 0, summaries: [], error: msg };
  }
}

export type ExperimentalPlacesGetDetailsResult = {
  ok: boolean;
  id?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  error?: string;
};

/**
 * `new Place({ id })` + `fetchFields` — 상세 필드 조회(실험).
 */
export async function experimentalPlacesGetDetailsTest(
  placeId: string
): Promise<ExperimentalPlacesGetDetailsResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "browser_only" };
  }
  const id = placeId.trim();
  if (!id) {
    return { ok: false, error: "empty_place_id" };
  }

  try {
    await loadGoogleMaps();
    const placesLib = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
    const PlaceCtor = placesLib.Place;

    const place = new PlaceCtor({ id });
    await place.fetchFields({
      fields: ["id", "displayName", "formattedAddress", "addressComponents", "location"],
    });

    return {
      ok: true,
      id: place.id,
      displayName: place.displayName ?? null,
      formattedAddress: place.formattedAddress ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * searchNearby → 첫 결과가 있으면 getDetails까지 순서대로 `console`에 출력.
 */
export async function experimentalPlacesRunConsoleSelfTest(
  center: google.maps.LatLngLiteral = { lat: 14.5995, lng: 120.9842 },
  radiusMeters = 80
): Promise<void> {
  if (typeof window === "undefined") {
    console.warn("[places-new-experimental] 브라우저에서만 실행 가능합니다.");
    return;
  }

  console.info("[places-new-experimental] experimentalPlacesSearchNearbyTest …");
  const nearby = await experimentalPlacesSearchNearbyTest(center, radiusMeters);
  console.info("[places-new-experimental] searchNearby:", nearby);

  const firstId = nearby.summaries[0]?.id;
  if (!firstId) {
    console.warn("[places-new-experimental] getDetails 생략 — 근처 결과 없음");
    return;
  }

  console.info("[places-new-experimental] experimentalPlacesGetDetailsTest:", firstId);
  const details = await experimentalPlacesGetDetailsTest(firstId);
  console.info("[places-new-experimental] getDetails:", details);
}
