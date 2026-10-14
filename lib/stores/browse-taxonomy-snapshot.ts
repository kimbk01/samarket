import {
  fetchStoresTaxonomyDeduped,
  peekStoresTaxonomyClientCache,
} from "@/lib/stores/store-delivery-api-client";
import {
  parseBrowseTaxonomyPayload,
  type BrowseTaxonomyLoaded,
} from "@/lib/stores/browse-taxonomy-resolvers";

/**
 * CONTRACT — browse `/stores/browse/*` taxonomy 단일 스냅샷.
 * - 네트워크: `fetchStoresTaxonomyDeduped` single-flight·TTL 1회
 * - 구독: 헤더 1차·2차·`StoresBrowsePrimaryView` 가 동일 파싱 결과 공유
 * DO NOT: 컴포넌트마다 별도 `useEffect` + `fetchStoresTaxonomyDeduped` (중복 setState)
 */

type SnapshotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: BrowseTaxonomyLoaded }
  | { status: "error" };

let state: SnapshotState = { status: "idle" };
const listeners = new Set<() => void>();
let reloadGeneration = 0;

function bump(): void {
  listeners.forEach((l) => l());
}

function tryHydrateFromPeek(): boolean {
  const peek = peekStoresTaxonomyClientCache();
  if (!peek) return false;
  const data = parseBrowseTaxonomyPayload(peek.json);
  if (!data) return false;
  state = { status: "ready", data };
  return true;
}

/** 마운트 시 1회 — 이미 ready/loading 이면 noop */
export function ensureBrowseTaxonomySnapshot(): void {
  if (state.status === "ready" || state.status === "loading") return;
  if (tryHydrateFromPeek()) {
    bump();
    return;
  }
  state = { status: "loading" };
  bump();
  void fetchStoresTaxonomyDeduped()
    .then(({ json }) => {
      const data = parseBrowseTaxonomyPayload(json);
      state = data ? { status: "ready", data } : { status: "error" };
      bump();
    })
    .catch(() => {
      state = { status: "error" };
      bump();
    });
}

export function getBrowseTaxonomySnapshot(): BrowseTaxonomyLoaded | null {
  return state.status === "ready" ? state.data : null;
}

export function subscribeBrowseTaxonomySnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseTaxonomySnapshotServerSnapshot(): BrowseTaxonomyLoaded | null {
  return null;
}

/** taxonomy TTL 캐시 무효화·테스트 — 다음 구독자가 재로드 */
export function invalidateBrowseTaxonomySnapshot(): void {
  state = { status: "idle" };
  bump();
}

/**
 * browse PTR — taxonomy 네트워크 재검증 후 스냅샷 갱신(헤더 1·2·3단).
 * 재검증 중·실패 시 직전 `ready` 스냅샷 유지 — 업종(primary) 판정이 null 로 흔들려
 * 「업종 없음」 화면·PTR 슬롯 언마운트가 일어나지 않게 한다 (PTR D14).
 */
export async function reloadBrowseTaxonomySnapshot(
  language?: import("@/lib/i18n/config").AppLanguageCode
): Promise<"success" | "error" | "cancelled"> {
  const gen = ++reloadGeneration;
  const { purgeStoresTaxonomyNetworkCache, fetchStoresTaxonomyDeduped } = await import(
    "@/lib/stores/store-delivery-api-client"
  );
  purgeStoresTaxonomyNetworkCache(language);
  const previous = state.status === "ready" ? state : null;
  if (!previous) {
    state = { status: "loading" };
    bump();
  }
  try {
    const { json } = await fetchStoresTaxonomyDeduped({ language });
    if (gen !== reloadGeneration) return "cancelled";
    const data = parseBrowseTaxonomyPayload(json);
    if (data) {
      state = { status: "ready", data };
      bump();
      return "success";
    }
  } catch {
    if (gen !== reloadGeneration) return "cancelled";
  }
  if (!previous) {
    state = { status: "error" };
    bump();
  }
  return "error";
}
