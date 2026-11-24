import {
  addLocationCities,
  loadLocationCitiesByIds,
  type LocationCityRow,
} from "@/lib/addresses/community-public-region-label";
import { loadNeighborhoodLocationRowsShared } from "@/lib/neighborhood/philife-feed-shared-config-cache.server";

/**
 * 글 목록·상세의 공개 지역(시/군) 이름 — 공유 캐시된 `locations` 전체 행(26행)에서 찾는다.
 *
 * 감사 2026-11-24 (docs/audit/supabase-request-surge-2026-11-18/budget-alert-cause-2026-11-24.md §2-2):
 * 11-20 대책은 「동네 키 → id」 조회만 공유 캐시로 옮겼고, 페이지마다 도는 이 지역 이름 조회
 * (`locations … in (ids)`)는 그대로 남아 동네 피드 요청당 Supabase 1.0 을 썼다.
 *
 * - 캐시에 없는 id(최근 5분 안에 생긴 동네 행)만 직접 조회한다 — 새 동네 글도 이름이 비지 않는다.
 * - 공유 캐시 읽기가 실패하면 예전 직접 조회 그대로.
 * - 변환은 `addLocationCities` 하나 — 직접 조회와 같은 결과.
 */
export async function loadLocationCitiesByIdsShared(
  sb: Parameters<typeof loadLocationCitiesByIds>[0],
  locationIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set([...locationIds].map((x) => String(x ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  let rows: LocationCityRow[];
  try {
    rows = await loadNeighborhoodLocationRowsShared();
  } catch {
    return loadLocationCitiesByIds(sb, ids);
  }

  const wanted = new Set(ids);
  addLocationCities(
    out,
    rows.filter((r) => wanted.has(String(r.id ?? "").trim())),
  );

  const known = new Set(rows.map((r) => String(r.id ?? "").trim()));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    const extra = await loadLocationCitiesByIds(sb, missing);
    for (const [id, city] of extra) out.set(id, city);
  }
  return out;
}
