import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

export type StoresHomeFeedClientMeta = {
  source?: string;
  compositionPolicy?: StoresHomeCompositionPolicyMeta & {
    shelfProduct?: { shelves?: unknown[] };
  };
  compositionEngine?: "live";
  [key: string]: unknown;
};

/**
 * Persist composition + shelfProduct in client cache (TTL-bound).
 * Stripping shelfProduct forced catalog defaults (e.g. food_horizontal) on remount
 * and broke Admin presentation ↔ customer HOME wiring.
 */
export function normalizeHomeFeedClientMeta(
  meta: StoresHomeFeedClientMeta | null | undefined
): StoresHomeFeedClientMeta | null {
  if (!meta) return null;
  return stripSponsoredFromHomeFeedClientMeta({ ...meta });
}

/**
 * ADC-12 — 스폰서드(유료) 행은 서버가 매 요청 기간·펀딩·상태를 재검사한 응답에서만 렌더한다.
 * 클라 캐시(메모리 10분·세션 45초)·live 스냅샷에는 유료 행을 남기지 않음 → 종료·중지된 광고와
 * 만료된 exposureToken 이 캐시 페인트로 다시 보이지 않는다. 재검증 응답이 오면 그 meta 로 다시 채워짐.
 * 쿠폰·오가닉 순서는 유지.
 */
export function stripSponsoredFromHomeFeedClientMeta<T extends object>(meta: T): T {
  const insertions = (meta as { homeInsertions?: StoresHomeInsertionMeta }).homeInsertions;
  if (!insertions || typeof insertions !== "object") return meta;
  const rest = insertions.restInsertion;
  return {
    ...meta,
    homeInsertions: {
      ...insertions,
      paidAds: [],
      restInsertion: rest
        ? {
            ...rest,
            rows: (rest.rows ?? []).filter((row) => row.kind === "organic"),
            adCount: 0,
            sponsoredStoreIds: [],
          }
        : rest,
    },
  } as T;
}

/** @deprecated Use normalizeHomeFeedClientMeta — kept for import compatibility */
export function stripCompositionPolicyFromHomeFeedClientMeta(
  meta: StoresHomeFeedClientMeta | null | undefined
): StoresHomeFeedClientMeta | null {
  return normalizeHomeFeedClientMeta(meta);
}
