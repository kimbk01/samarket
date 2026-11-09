import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";
import {
  getApprovedStoreBySlug,
  getStoreBySlugForViewer,
  STORE_SELECT_SUMMARY,
  type StoreCommerceMeta,
} from "@/lib/stores/get-approved-store-by-slug";
import { isSampleStoreKind, loadStorePublicMenuOpen } from "@/lib/stores/store-public-menu-open";
import { peekStoreCommerceMetaCached, resolveStoreOrderabilityCached } from "@/lib/stores/load-store-commerce-meta-cached";

export type StoreSummaryPublicBody = {
  ok: boolean;
  store: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  error?: string;
};

/**
 * CRT-01 — slug 단위 서버 캐시·single-flight 에 담는 **보는 사람과 무관한** summary 본문.
 * `viewer_*`·`can_order_store`·`owner_block_message`·찜 집계는 여기 없음 → 요청마다 `composeStoreSummaryPublicForViewer`.
 */
export type StoreSummaryPublicShared = {
  body: StoreSummaryPublicBody;
  storeId: string;
  ownerUserId: string;
};

export type FetchStoreSummaryPublicSharedResult = {
  shared: StoreSummaryPublicShared | null;
  body: StoreSummaryPublicBody;
  status: number;
  queryCount: number;
  dbMs: number;
};

export async function fetchStoreSummaryPublicShared(
  sb: SupabaseClient,
  decodedSlug: string
): Promise<FetchStoreSummaryPublicSharedResult> {
  const t0 = performance.now();
  let queryCount = 0;

  const storeRes = await getApprovedStoreBySlug(sb, decodedSlug, STORE_SELECT_SUMMARY);
  queryCount += 1;

  if (storeRes.ok === false) {
    const dbMs = Math.round(performance.now() - t0);
    if (storeRes.reason === "db_error") {
      /** 묶음4 F-09 — DB 오류 문구는 서버 로그에만, 응답은 고정 코드 */
      console.error("[fetchStoreSummaryPublicShared] store", storeRes.message);
      return {
        shared: null,
        body: {
          ok: false,
          store: null,
          meta: { source: "supabase" },
          error: STORE_PUBLIC_API_ERROR_CODES.storeSummary,
        },
        status: 500,
        queryCount,
        dbMs,
      };
    }
    return {
      shared: null,
      body: { ok: true, store: null, meta: { source: "supabase" } },
      status: 404,
      queryCount,
      dbMs,
    };
  }

  const built = await buildStoreSummaryShared(sb, storeRes.store, false);
  queryCount += built.queryCount;
  return {
    shared: built.shared,
    body: built.shared.body,
    status: 200,
    queryCount,
    dbMs: Math.round(performance.now() - t0),
  };
}

/**
 * 사장님 본인 숨김 매장 summary (Owner 「본인 열람으로 수정」 2026-11-03).
 * 공용 결과가 404 일 때만 호출 — 결과는 **본인 전용**이라 slug 캐시·single-flight 에 넣지 않는다.
 * null = 본인 매장 아님·미승인 (공용 404 유지).
 */
export async function fetchStoreSummaryOwnerHiddenPreview(
  sb: SupabaseClient,
  decodedSlug: string,
  viewerId: string | null
): Promise<{ shared: StoreSummaryPublicShared; queryCount: number } | null> {
  if (!viewerId?.trim()) return null;
  const storeRes = await getStoreBySlugForViewer(sb, decodedSlug, STORE_SELECT_SUMMARY, viewerId);
  if (storeRes.ok === false || !storeRes.ownerHiddenPreview) return null;
  const built = await buildStoreSummaryShared(sb, storeRes.store, true);
  return { shared: built.shared, queryCount: built.queryCount + 1 };
}

async function buildStoreSummaryShared(
  sb: SupabaseClient,
  store: Record<string, unknown>,
  ownerHiddenPreview: boolean
): Promise<{ shared: StoreSummaryPublicShared; queryCount: number }> {
  const storeId = String(store.id ?? "");
  const ownerUserId = String(store.owner_user_id ?? "").trim();

  /**
   * S-01 — canSell(판매 승인) = 주문 CTA 전용 · menuOpen = DB `store_public_menu_open`(판매 승인 OR 샘플).
   * 두 조회는 병렬 — 왕복 시간 증가 없음.
   */
  const [permRes, menuOpen] = await Promise.all([
    sb
      .from("store_sales_permissions")
      .select("allowed_to_sell, sales_status")
      .eq("store_id", storeId)
      .maybeSingle(),
    loadStorePublicMenuOpen(sb, storeId),
  ]);
  const perm = permRes.data;
  const canSell = !!perm && perm.allowed_to_sell === true && perm.sales_status === "approved";
  /** S-03 — 공개 응답에는 `store_kind` 원문 대신 boolean 하나만. */
  const isSampleStore = isSampleStoreKind((store as { store_kind?: unknown }).store_kind);

  const publicStore = { ...store };
  delete (publicStore as { owner_user_id?: unknown }).owner_user_id;
  delete (publicStore as { store_kind?: unknown }).store_kind;

  const body: StoreSummaryPublicBody = {
    ok: true,
    store: publicStore,
    meta: {
      canSell,
      menuOpen,
      isSampleStore,
      source: "supabase",
      ...(ownerHiddenPreview ? { owner_hidden_preview: true } : {}),
      ...(ownerHiddenPreview && String(store.approval_status ?? "").trim() !== "approved"
        ? { owner_preview_pending: true }
        : {}),
    },
  };
  return { shared: { body, storeId, ownerUserId }, queryCount: 2 };
}

/** 캐시에서 꺼낸 값이 `StoreSummaryPublicShared` 형태인지 (구 형태·테스트 값은 miss 처리). */
export function asStoreSummaryPublicShared(v: unknown): StoreSummaryPublicShared | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<StoreSummaryPublicShared>;
  if (!o.body || typeof o.body !== "object") return null;
  if (typeof o.storeId !== "string" || typeof o.ownerUserId !== "string") return null;
  return o as StoreSummaryPublicShared;
}

/**
 * 공용 본문 + 보는 사람 기준 필드(주문 가능·본인 매장·찜) — 요청마다 계산.
 * 찜/주문 집계는 viewer 별 메타 캐시 hit 시만 포함(없으면 0 — `/menus` 병렬 응답이 보강).
 */
export async function composeStoreSummaryPublicForViewer(
  sb: SupabaseClient,
  shared: StoreSummaryPublicShared,
  viewerId: string | null
): Promise<{ body: StoreSummaryPublicBody; queryCount: number; metaCacheHit: boolean }> {
  const cachedMeta = peekStoreCommerceMetaCached(shared.storeId, viewerId);
  const viewerIsOwner =
    Boolean(viewerId?.trim()) && shared.ownerUserId.length > 0 && shared.ownerUserId === viewerId!.trim();
  const orderability = await resolveStoreOrderabilityCached(sb, viewerId, shared.ownerUserId);
  const meta: Pick<StoreCommerceMeta, "favoriteCount" | "recentOrderCount" | "viewerFavorited"> =
    cachedMeta ?? { favoriteCount: 0, recentOrderCount: 0, viewerFavorited: false };

  return {
    body: {
      ...shared.body,
      meta: {
        ...shared.body.meta,
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
        ...orderability,
      },
    },
    queryCount: viewerIsOwner ? 1 : 0,
    metaCacheHit: Boolean(cachedMeta),
  };
}
