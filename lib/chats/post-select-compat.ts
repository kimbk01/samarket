import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * posts 조회 — Supabase에 seller_listing_state 미적용·스키마 캐시 불일치 시에도 채팅이 동작하도록 폴백.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT,
  POST_TRADE_CHAT_BARE_MIN_SELECT,
  POST_TRADE_DETAIL_SELECT,
  POST_TRADE_RELATION_SELECT,
} from "@/lib/posts/post-query-select";

/** `fetchPostRowForChat` 이 최종적으로 채택한 posts 행 출처(관계 폴백 체인 포함) */
export type FetchPostRowForChatRelationAdoptedFrom =
  | "posts_preferred"
  | "posts_safe_r2"
  | "rNarrow"
  | "rRel"
  | "rAbs"
  | "rBare"
  | "none";

/** `fetchPostRowForChat` 단계 계측 — `fetchPostEntryMs` 는 0, 나머지는 함수 진입 대비 누적 ms */
export type FetchPostRowForChatDiagnostics = {
  fetchPostEntryMs?: number;
  fetchPostPostsQueryStartMs?: number;
  fetchPostPostsQueryDoneMs?: number;
  /** `fetchPostPostsQueryDoneMs` 직후 동일 시점(연속 스탬프) */
  fetchPostAfterPostsQueryDoneMs?: number;
  fetchPostR2StartMs?: number;
  fetchPostR2DoneMs?: number;
  fetchPostRNarrowStartMs?: number;
  fetchPostRNarrowDoneMs?: number;
  /** `fetchPostRNarrowDoneMs` 직후 */
  fetchPostAfterRNarrowDoneMs?: number;
  fetchPostRRelStartMs?: number;
  fetchPostRRelDoneMs?: number;
  fetchPostRAbsStartMs?: number;
  fetchPostRAbsDoneMs?: number;
  fetchPostRBareStartMs?: number;
  fetchPostRBareDoneMs?: number;
  /** 각 `fetchPostRelationDoneMs` 스탬프 직전 */
  fetchPostBeforeRelationDoneMs?: number;
  fetchPostRelationDoneMs?: number;
  fetchPostMappingDoneMs?: number;
  fetchPostPreReturnMs?: number;
  fetchPostGapEntryToPostsQueryDoneMs?: number;
  fetchPostGapPostsDoneToRelationDoneMs?: number;
  fetchPostGapRelationToMappingDoneMs?: number;
  fetchPostGapMappingToReturnMs?: number;
  /** posts_query_done → r2 완료(미실행 시 posts 와 동일 시각으로 0ms) */
  fetchPostGapPostsDoneToR2DoneMs?: number;
  /** r2 완료 → rNarrow 첫 await 완료(미실행 시 0ms) */
  fetchPostGapR2DoneToRNarrowDoneMs?: number;
  /** rNarrow 완료 → relation_done */
  fetchPostGapRNarrowDoneToRelationDoneMs?: number;
  /** rNarrow 완료 → rRel await 완료(rRel 미실행 시 0ms에 가깝게) */
  fetchPostGapRNarrowDoneToRRelDoneMs?: number;
  fetchPostGapRRelDoneToRAbsDoneMs?: number;
  fetchPostGapRAbsDoneToRBareDoneMs?: number;
  fetchPostGapRBareDoneToRelationDoneMs?: number;
  /** 최종 채택 단계(진단) */
  fetchPostRelationAdoptedFrom?: FetchPostRowForChatRelationAdoptedFrom;
  /** `if (error)` 폴백에서 rRel await 을 실제로 호출했는지 */
  fetchPostRRelRan?: boolean;
  fetchPostRRelHasError?: boolean;
  fetchPostRRelHasData?: boolean;
  fetchPostRAbsRan?: boolean;
  fetchPostRAbsHasError?: boolean;
  fetchPostRAbsHasData?: boolean;
  fetchPostRBareRan?: boolean;
  fetchPostRBareHasError?: boolean;
  fetchPostRBareHasData?: boolean;
  /** PostgREST `if (error)` 폴백 단계별 오류(있을 때만) */
  fetchPostRNarrowErrorCode?: string;
  fetchPostRNarrowErrorMessage?: string;
  fetchPostRRelErrorCode?: string;
  fetchPostRRelErrorMessage?: string;
  fetchPostRAbsErrorCode?: string;
  fetchPostRAbsErrorMessage?: string;
};

function stampPostgrestErrorFields(
  diag: FetchPostRowForChatDiagnostics | undefined,
  step: "rNarrow" | "rRel" | "rAbs",
  err: { message?: string; code?: string } | null | undefined
): void {
  if (!diag || !err) return;
  const code = typeof err.code === "string" ? err.code : undefined;
  const message = typeof err.message === "string" ? err.message : err.message != null ? String(err.message) : undefined;
  if (step === "rNarrow") {
    diag.fetchPostRNarrowErrorCode = code;
    diag.fetchPostRNarrowErrorMessage = message;
  } else if (step === "rRel") {
    diag.fetchPostRRelErrorCode = code;
    diag.fetchPostRRelErrorMessage = message;
  } else {
    diag.fetchPostRAbsErrorCode = code;
    diag.fetchPostRAbsErrorMessage = message;
  }
}

export function finalizeFetchPostRowForChatDiagnostics(d: FetchPostRowForChatDiagnostics): void {
  const e = d.fetchPostEntryMs ?? 0;
  const pd = d.fetchPostPostsQueryDoneMs;
  const rel = d.fetchPostRelationDoneMs;
  const map = d.fetchPostMappingDoneMs;
  const pr = d.fetchPostPreReturnMs;
  if (pd != null) d.fetchPostGapEntryToPostsQueryDoneMs = Math.round(pd - e);
  if (pd != null && rel != null) d.fetchPostGapPostsDoneToRelationDoneMs = Math.round(rel - pd);
  if (rel != null && map != null) d.fetchPostGapRelationToMappingDoneMs = Math.round(map - rel);
  if (map != null && pr != null) d.fetchPostGapMappingToReturnMs = Math.round(pr - map);

  const r2dReal = d.fetchPostR2DoneMs;
  const rndReal = d.fetchPostRNarrowDoneMs;
  const effR2d = r2dReal ?? pd;
  const effRnd = rndReal ?? effR2d;
  if (pd != null && effR2d != null) d.fetchPostGapPostsDoneToR2DoneMs = Math.round(effR2d - pd);
  if (effR2d != null && effRnd != null) d.fetchPostGapR2DoneToRNarrowDoneMs = Math.round(effRnd - effR2d);
  if (effRnd != null && rel != null) d.fetchPostGapRNarrowDoneToRelationDoneMs = Math.round(rel - effRnd);

  const rn = d.fetchPostRNarrowDoneMs;
  if (rn != null && rel != null) {
    const afterN = d.fetchPostAfterRNarrowDoneMs ?? rn;
    const rRelD = d.fetchPostRRelDoneMs ?? afterN;
    const rAbsD = d.fetchPostRAbsDoneMs ?? rRelD;
    const rBareD = d.fetchPostRBareDoneMs ?? rAbsD;
    d.fetchPostGapRNarrowDoneToRRelDoneMs = Math.round(rRelD - rn);
    d.fetchPostGapRRelDoneToRAbsDoneMs = Math.round(rAbsD - rRelD);
    d.fetchPostGapRAbsDoneToRBareDoneMs = Math.round(rBareD - rAbsD);
    d.fetchPostGapRBareDoneToRelationDoneMs = Math.round(rel - rBareD);
  }
}

export function isMissingSellerListingColumnError(message: string | undefined | null): boolean {
  const m = String(message ?? "");
  return (
    /seller_listing_state/i.test(m) &&
    /does not exist|unknown column|schema cache|Could not find/i.test(m)
  );
}

/** 채팅 카드·거래 보조 필드용 기본 컬럼 — PostgREST `posts` OpenAPI 속성과 정합(없는 컬럼 제외) */
const POST_COLUMNS_CHAT_SAFE =
  "id, user_id, title, content, price, status, sold_buyer_id, reserved_buyer_id, thumbnail_url, images, region, city, meta, view_count, favorite_count, created_at, updated_at, trade_category_id, is_free_share";
const POST_COLUMNS_CHAT_PREFERRED = `${POST_COLUMNS_CHAT_SAFE}, seller_listing_state`;

export async function fetchPostRowForChat(
  sbAny: SupabaseClient<any>,
  postId: string,
  diag?: FetchPostRowForChatDiagnostics
): Promise<Record<string, unknown> | null> {
  const t0 = diag ? performance.now() : 0;
  const stamp = (field: keyof FetchPostRowForChatDiagnostics) => {
    if (diag) (diag as Record<string, number>)[field as string] = Math.round(performance.now() - t0);
  };
  const stampRelFallbackOutcome = (patch: Partial<FetchPostRowForChatDiagnostics>) => {
    if (diag) Object.assign(diag, patch);
  };
  if (diag) diag.fetchPostEntryMs = 0;
  const pid = typeof postId === "string" ? postId.trim() : "";
  if (!pid) return null;

  stamp("fetchPostPostsQueryStartMs");
  let { data, error } = await sbAny
    .from(POSTS_TABLE_READ)
    .select(POST_COLUMNS_CHAT_PREFERRED)
    .eq("id", pid)
    .maybeSingle();
  stamp("fetchPostPostsQueryDoneMs");
  stamp("fetchPostAfterPostsQueryDoneMs");
  if (error && isMissingSellerListingColumnError(error.message)) {
    stamp("fetchPostR2StartMs");
    const r2 = await sbAny.from(POSTS_TABLE_READ).select(POST_COLUMNS_CHAT_SAFE).eq("id", pid).maybeSingle();
    stamp("fetchPostR2DoneMs");
    data = (r2.data ?? null) as unknown as typeof data;
    error = r2.error;
    if (diag && !error && data) {
      diag.fetchPostRelationAdoptedFrom = "posts_safe_r2";
    }
    stamp("fetchPostBeforeRelationDoneMs");
    stamp("fetchPostRelationDoneMs");
  }

  if (!error && data) {
    stampRelFallbackOutcome({
      fetchPostRelationAdoptedFrom: diag?.fetchPostRelationAdoptedFrom ?? "posts_preferred",
      fetchPostRRelRan: false,
      fetchPostRAbsRan: false,
      fetchPostRBareRan: false,
    });
    if (diag && diag.fetchPostRelationDoneMs == null && diag.fetchPostPostsQueryDoneMs != null) {
      stamp("fetchPostBeforeRelationDoneMs");
      diag.fetchPostRelationDoneMs = diag.fetchPostPostsQueryDoneMs;
    }
    stamp("fetchPostMappingDoneMs");
    stamp("fetchPostPreReturnMs");
    if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
    return data as Record<string, unknown>;
  }

  /**
   * 배포·마이그레이션마다 `posts` 컬럼 집합이 달라, 존재하지 않는 컬럼이 SELECT 에 포함되면
   * PostgREST 가 전체 요청을 거부하고 행이 없는 것처럼 보일 수 있음.
   * 채팅 상단 카드는 `chatProductSummaryFromPostRow(undefined, postId)` 로 떨어져
   * 「글 · UUID…」, ₩0, 썸네일 없음 이 됨 → `*` 로 실제 행을 반드시 가져온다.
   */
  if (error) {
    stamp("fetchPostRNarrowStartMs");
    const rNarrow = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_DETAIL_SELECT).eq("id", pid).maybeSingle();
    stamp("fetchPostRNarrowDoneMs");
    stamp("fetchPostAfterRNarrowDoneMs");
    stampPostgrestErrorFields(diag, "rNarrow", rNarrow.error);
    if (!rNarrow.error && rNarrow.data) {
      stampRelFallbackOutcome({
        fetchPostRelationAdoptedFrom: "rNarrow",
        fetchPostRRelRan: false,
        fetchPostRAbsRan: false,
        fetchPostRBareRan: false,
      });
      stamp("fetchPostBeforeRelationDoneMs");
      stamp("fetchPostRelationDoneMs");
      stamp("fetchPostMappingDoneMs");
      stamp("fetchPostPreReturnMs");
      if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
      return rNarrow.data as Record<string, unknown>;
    }
    stamp("fetchPostRRelStartMs");
    const rRel = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", pid).maybeSingle();
    stamp("fetchPostRRelDoneMs");
    stampPostgrestErrorFields(diag, "rRel", rRel.error);
    stampRelFallbackOutcome({
      fetchPostRRelRan: true,
      fetchPostRRelHasError: !!rRel.error,
      fetchPostRRelHasData: !!rRel.data,
    });
    if (!rRel.error && rRel.data) {
      stampRelFallbackOutcome({
        fetchPostRelationAdoptedFrom: "rRel",
        fetchPostRAbsRan: false,
        fetchPostRBareRan: false,
      });
      stamp("fetchPostBeforeRelationDoneMs");
      stamp("fetchPostRelationDoneMs");
      stamp("fetchPostMappingDoneMs");
      stamp("fetchPostPreReturnMs");
      if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
      return rRel.data as Record<string, unknown>;
    }
    stamp("fetchPostRAbsStartMs");
    const rAbs = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT).eq("id", pid).maybeSingle();
    stamp("fetchPostRAbsDoneMs");
    stampPostgrestErrorFields(diag, "rAbs", rAbs.error);
    stampRelFallbackOutcome({
      fetchPostRAbsRan: true,
      fetchPostRAbsHasError: !!rAbs.error,
      fetchPostRAbsHasData: !!rAbs.data,
    });
    if (!rAbs.error && rAbs.data) {
      stampRelFallbackOutcome({
        fetchPostRelationAdoptedFrom: "rAbs",
        fetchPostRBareRan: false,
      });
      stamp("fetchPostBeforeRelationDoneMs");
      stamp("fetchPostRelationDoneMs");
      stamp("fetchPostMappingDoneMs");
      stamp("fetchPostPreReturnMs");
      if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
      return rAbs.data as Record<string, unknown>;
    }
    stamp("fetchPostRBareStartMs");
    const rBare = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_CHAT_BARE_MIN_SELECT).eq("id", pid).maybeSingle();
    stamp("fetchPostRBareDoneMs");
    stampRelFallbackOutcome({
      fetchPostRBareRan: true,
      fetchPostRBareHasError: !!rBare.error,
      fetchPostRBareHasData: !!rBare.data,
    });
    if (!rBare.error && rBare.data) {
      stampRelFallbackOutcome({ fetchPostRelationAdoptedFrom: "rBare" });
      stamp("fetchPostBeforeRelationDoneMs");
      stamp("fetchPostRelationDoneMs");
      stamp("fetchPostMappingDoneMs");
      stamp("fetchPostPreReturnMs");
      if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
      return rBare.data as Record<string, unknown>;
    }
    stampRelFallbackOutcome({ fetchPostRelationAdoptedFrom: "none" });
    stamp("fetchPostBeforeRelationDoneMs");
    stamp("fetchPostRelationDoneMs");
    stamp("fetchPostMappingDoneMs");
    stamp("fetchPostPreReturnMs");
    if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
    return null;
  }

  if (diag && diag.fetchPostRelationDoneMs == null && diag.fetchPostPostsQueryDoneMs != null) {
    stamp("fetchPostBeforeRelationDoneMs");
    diag.fetchPostRelationDoneMs = diag.fetchPostPostsQueryDoneMs;
  }
  stampRelFallbackOutcome({
    fetchPostRelationAdoptedFrom: "none",
    fetchPostRRelRan: false,
    fetchPostRAbsRan: false,
    fetchPostRBareRan: false,
  });
  stamp("fetchPostMappingDoneMs");
  stamp("fetchPostPreReturnMs");
  if (diag) finalizeFetchPostRowForChatDiagnostics(diag);
  return null;
}

/**
 * `item_id` 가 비어 있거나 잘못됐을 때 `related_post_id` 등으로 posts 를 찾기 — 채팅 상단 카드·목록과 동일 행 필요
 */
export async function fetchPostRowForChatFirstResolved(
  sbAny: SupabaseClient<any>,
  candidatePostIds: readonly string[]
): Promise<Record<string, unknown> | null> {
  const seen = new Set<string>();
  for (const raw of candidatePostIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = await fetchPostRowForChat(sbAny, id);
    if (row) return row;
  }
  return null;
}

/**
 * chat_rooms.item_id / related_post_id 로 posts 를 못 찾을 때 — 동일 판매자·구매자 `product_chats.post_id` 로 조회
 * (통합 방만 있고 item_id 가 비어 있는 데이터·스키마 불일치 보정)
 */
export async function fetchPostRowForChatViaProductChatsPair(
  sbAny: SupabaseClient<any>,
  sellerId: string | null | undefined,
  buyerId: string | null | undefined,
  skipPostIds: readonly string[]
): Promise<Record<string, unknown> | null> {
  const sid = typeof sellerId === "string" ? sellerId.trim() : "";
  const bid = typeof buyerId === "string" ? buyerId.trim() : "";
  if (!sid || !bid) return null;

  const skip = new Set(skipPostIds.map((x) => String(x).trim()).filter(Boolean));

  const { data: rows, error } = await sbAny
    .from("product_chats")
    .select("post_id")
    .eq("seller_id", sid)
    .eq("buyer_id", bid)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error || !Array.isArray(rows)) return null;

  for (const row of rows) {
    const pid = typeof (row as { post_id?: unknown }).post_id === "string" ? (row as { post_id: string }).post_id.trim() : "";
    if (!pid || skip.has(pid)) continue;
    skip.add(pid);
    const p = await fetchPostRowForChat(sbAny, pid);
    if (p) return p;
  }
  return null;
}

export async function fetchPostRowsForChatIn(
  sbAny: SupabaseClient<any>,
  postIds: string[]
): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return [];

  let { data, error } = await sbAny.from(POSTS_TABLE_READ).select(POST_COLUMNS_CHAT_PREFERRED).in("id", ids);
  if (error && isMissingSellerListingColumnError(error.message)) {
    const r2 = await sbAny.from(POSTS_TABLE_READ).select(POST_COLUMNS_CHAT_SAFE).in("id", ids);
    data = (r2.data ?? null) as unknown as typeof data;
    error = r2.error;
  }
  if (!error && Array.isArray(data)) return data as Record<string, unknown>[];

  if (error) {
    const rNarrow = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_DETAIL_SELECT).in("id", ids);
    if (!rNarrow.error && Array.isArray(rNarrow.data) && rNarrow.data.length) {
      return rNarrow.data as Record<string, unknown>[];
    }
    const rRel = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", ids);
    if (!rRel.error && Array.isArray(rRel.data) && rRel.data.length) {
      return rRel.data as Record<string, unknown>[];
    }
    const rAbs = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT).in("id", ids);
    if (!rAbs.error && Array.isArray(rAbs.data) && rAbs.data.length) {
      return rAbs.data as Record<string, unknown>[];
    }
    const rBare = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_CHAT_BARE_MIN_SELECT).in("id", ids);
    if (!rBare.error && Array.isArray(rBare.data)) return rBare.data as Record<string, unknown>[];
  }

  return [];
}
