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
