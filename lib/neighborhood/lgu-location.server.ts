/**
 * COMMUNITY LOCATION = 시/군 LGU (주소 SSOT 2단계 · Owner 2026-11-09).
 *
 * 커뮤니티 「동네」 기준은 회원 대표 주소의 시/군 LGU(PSGC) 하나다 — 키 `lgu:<PSGC>:`.
 * 예전 글은 앱 동네 목록(143개) 키로 저장된 `locations` 행에 붙어 있다 → 그 행을 같은 시/군 LGU 로 묶어서 함께 읽는다
 * (동네 목록 → LGU 대응표는 거래와 같은 `trade-lgu-city-rollup` + `TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL`, 데이터 변경 없음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { deterministicUuid } from "@/lib/server/deterministic-uuid";
import { resolvePublicCityName } from "@/lib/addresses/address-display-levels";
import { REGIONS } from "@/lib/products/form-options";
import { appLocationIdsToCanonicalLguId } from "@/lib/addresses/app-location-lgu";

const LGU_KEY_RE = /^lgu:(\d{10}):?$/;

/** `lgu:1381300000:` → "1381300000" */
export function parseLguLocationKey(key: string | null | undefined): string | null {
  const m = (key ?? "").trim().match(LGU_KEY_RE);
  return m ? m[1]! : null;
}

export function lguLocationKey(lguId: string): string {
  return `lgu:${lguId.trim()}:`;
}

/** 시/군 이름 (거래 공개 도시와 같은 이름) */
export function lguPublicName(lguId: string): string | null {
  return resolvePublicCityName({ cityLguId: lguId, cityText: null });
}

/** 앱 동네 목록 (지역 이름, 동네 이름) → 시/군 PSGC */
export function legacyLocationRowToLguId(regionName: string | null | undefined, areaName: string | null | undefined): string | null {
  const r = (regionName ?? "").trim();
  const a = (areaName ?? "").trim();
  if (!r || !a) return null;
  const region = REGIONS.find((x) => x.name === r || x.id === r);
  if (!region) return null;
  const city = region.cities.find((c) => c.name === a || c.id === a);
  if (!city) return null;
  return appLocationIdsToCanonicalLguId(region.id, city.id);
}

/** 시/군 LGU 의 `locations` 행 id — 결정적 uuid(같은 LGU 면 같은 id). DB 조회·쓰기 없음. */
export function lguLocationRowId(lguId: string): string | null {
  if (!lguPublicName(lguId)) return null;
  return deterministicUuid("samarket_neighborhood_location", lguLocationKey(lguId));
}

/** 시/군 LGU 의 `locations` 행 id. 없으면 만든다 — **글쓰기 경로 전용**(조회에서 부르지 않는다 · M3). */
export async function ensureLguLocationId(sb: SupabaseClient<any>, lguId: string): Promise<string | null> {
  const name = lguPublicName(lguId);
  if (!name) return null;
  const id = deterministicUuid("samarket_neighborhood_location", lguLocationKey(lguId));
  const { data } = await sb.from("locations").select("id").eq("id", id).maybeSingle();
  if (data && typeof (data as { id?: string }).id === "string") return id;
  const { error } = await sb
    .from("locations")
    .upsert({ id, country: "Philippines", city: name, district: "", name }, { onConflict: "id" });
  if (error) {
    const again = await sb.from("locations").select("id").eq("id", id).maybeSingle();
    return again.data ? id : null;
  }
  return id;
}

let legacyCache: { at: number; byLgu: Map<string, string[]> } | null = null;
const LEGACY_CACHE_MS = 60_000;

/** 예전 앱 동네 목록 `locations` 행 → 시/군 PSGC 별 id 묶음 (60초 캐시) */
async function loadLegacyLocationIdsByLgu(sb: SupabaseClient<any>): Promise<Map<string, string[]>> {
  if (legacyCache && Date.now() - legacyCache.at < LEGACY_CACHE_MS) return legacyCache.byLgu;
  const byLgu = new Map<string, string[]>();
  const { data, error } = await sb.from("locations").select("id, city, name");
  if (!error && Array.isArray(data)) {
    for (const row of data as { id?: string; city?: string | null; name?: string | null }[]) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      const lgu = legacyLocationRowToLguId(row.city, row.name);
      if (!lgu) continue;
      const list = byLgu.get(lgu) ?? [];
      list.push(id);
      byLgu.set(lgu, list);
    }
  }
  legacyCache = { at: Date.now(), byLgu };
  return byLgu;
}

/**
 * 시/군 LGU 피드가 읽을 `locations.id` 전부 = LGU 행 + 같은 시/군의 예전 동네 행.
 * M3 (2026-11-09): 조회는 읽기만 — LGU 행 id 는 계산값을 쓰고 행을 만들지 않는다
 * (행이 아직 없으면 그 id 의 글도 없으므로 결과 같음. 이전: 비로그인 조회만으로 locations 행 생성).
 */
export async function resolveCommunityLocationIdsForLgu(
  sb: SupabaseClient<any>,
  lguId: string,
): Promise<string[]> {
  const own = lguLocationRowId(lguId);
  const legacy = (await loadLegacyLocationIdsByLgu(sb)).get(lguId) ?? [];
  return [...new Set([...(own ? [own] : []), ...legacy])];
}
