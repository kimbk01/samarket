/**
 * v4 재감사 PERF-14 — `GET /api/stores/browse-top-banners` 의 짧은 인스턴스 메모리 캐시.
 *
 * - 게이트(`resolveDeliveryViewerGate === "ok"`) 통과 후에만 사용한다.
 * - 키: 1차 업종 · 2차 업종 · origin 지역(source·좌표 6자리·LGU) — 배너 로더가 읽는 origin 필드
 *   (`BannerViewerOrigin`: source·lat·lng·canonicalLguId)와 같다. 사용자 id·주소 id 는 키·값에 넣지 않는다.
 *   응답 본문은 언어에 따라 달라지지 않으므로(배너 제목·부제는 원문) 언어는 키에 넣지 않는다.
 * - 값: 노출 토큰을 뺀 본문. 토큰(렌더 인스턴스 단위·만료 포함)은 매 요청 새로 발급한다.
 * - DEF-64 세대 purge(`purgeAllStorePublicServerMemoryCaches`)에 등록 — 관리자 업종·정책 쓰기 즉시 반영.
 * - TTL 은 홈 피드와 같은 20s (광고 승인·기간 경계의 반영 상한).
 */
export const STORE_BROWSE_TOP_BANNERS_SERVER_CACHE_TTL_MS = 20_000;
export const STORE_BROWSE_TOP_BANNERS_SERVER_CACHE_MAX_ENTRIES = 500;

type Entry = { expiresAt: number; body: unknown };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function coordKey(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(6) : "";
}

export function buildStoreBrowseTopBannersCacheKey(input: {
  primary: string;
  sub: string | null;
  origin: {
    source: string;
    lat: number | null;
    lng: number | null;
    canonicalLguId: string | null;
  };
}): string {
  return [
    input.primary,
    input.sub ?? "",
    input.origin.source,
    coordKey(input.origin.lat),
    coordKey(input.origin.lng),
    input.origin.canonicalLguId ?? "",
  ].join("|");
}

export function peekStoreBrowseTopBannersServerCache<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return e.body as T;
}

function setEntry(key: string, body: unknown): void {
  if (cache.size >= STORE_BROWSE_TOP_BANNERS_SERVER_CACHE_MAX_ENTRIES && !cache.has(key)) {
    const now = Date.now();
    for (const [k, e] of cache) {
      if (e.expiresAt <= now) cache.delete(k);
    }
    while (cache.size >= STORE_BROWSE_TOP_BANNERS_SERVER_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  cache.set(key, { expiresAt: Date.now() + STORE_BROWSE_TOP_BANNERS_SERVER_CACHE_TTL_MS, body });
}

/** 캐시 미스 시 loader 를 키당 1회만 실행 (동시 요청 합류). loader 가 null 을 주면 저장하지 않는다. */
export async function loadStoreBrowseTopBannersWithCache<T>(
  key: string,
  loader: () => Promise<T | null>
): Promise<T | null> {
  const hit = peekStoreBrowseTopBannersServerCache<T>(key);
  if (hit) return hit;
  const running = inflight.get(key);
  if (running) return (await running) as T | null;
  const flight = (async () => {
    const body = await loader();
    if (body != null) setEntry(key, body);
    return body;
  })();
  inflight.set(key, flight);
  try {
    return await flight;
  } finally {
    if (inflight.get(key) === flight) inflight.delete(key);
  }
}

/** DEF-64 세대 purge 등록 — `purgeAllStorePublicServerMemoryCaches` */
export function clearStoreBrowseTopBannersServerCache(): void {
  cache.clear();
}

/** 테스트 */
export function storeBrowseTopBannersServerCacheSizeForTests(): number {
  return cache.size;
}
