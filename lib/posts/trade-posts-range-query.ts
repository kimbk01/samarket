import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * 거래 마켓 목록용 posts 범위 조회 — 클라이언트 Supabase · Route Handler 공용 ("use client" 없음)
 */
import type { PostWithMeta } from "./schema";
import {
  normalizePostImages,
  normalizePostMeta,
  normalizePostPrice,
} from "./post-normalize";
import { applyPostgrestAndGroup } from "./apply-postgrest-and-group";

/** listing_kind 필터 시 DB를 순차 스캔하는 최대 청크 수(getPostsByCategory 와 동일) */
export const MAX_JOB_LISTING_KIND_CHUNKS = 120;

export const PAGE_SIZE_TRADE_FEED = 20;

/**
 * 목록 카드용 — `content` 등 대용량 텍스트 제외.
 * 일부 DB에 컬럼이 없으면 PostgREST 오류 → `select('*')` 폴백.
 */
export const POST_TRADE_LIST_SELECT =
  "id, user_id, author_id, type, title, price, is_price_offer, is_free_share, region, city, contact_method, status, seller_listing_state, reserved_buyer_id, view_count, thumbnail_url, images, meta, created_at, updated_at, trade_category_id, category_id, favorite_count, comment_count, chat_count, author_nickname, board_id, service_id, visibility";

function looksLikeMissingColumnOrSchemaError(message: string | undefined | null): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    /could not find|does not exist|unknown column|schema cache|42703/i.test(m) ||
    /column .* of relation ['"]posts['"]/i.test(m)
  );
}

export function mapPostRowsToTradeList(data: unknown[]): PostWithMeta[] {
  return (data as PostWithMeta[]).map((p) => {
    const row = p as unknown as Record<string, unknown>;
    const images = normalizePostImages(row.images);
    const thumbnail_url =
      typeof row.thumbnail_url === "string" && row.thumbnail_url
        ? row.thumbnail_url
        : images?.[0] ?? null;
    const author_id = (row.author_id as string) ?? (row.user_id as string);
    const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
    const price = normalizePostPrice(row.price);
    const meta = normalizePostMeta(row.meta);
    const is_free_share = row.is_free_share === true || row.is_free_share === "true";
    return {
      ...p,
      author_id,
      category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
    } as PostWithMeta;
  });
}

export type TradePostSort = "latest" | "popular";

/**
 * 거래 카테고리 필터 — `trade_category_id` 와 레거시/마이그레이션 `category_id` 중 하나에만
 * 값이 있어도 매칭되도록 OR 로 조회한다. (전체 피드는 컬럼 필터 없음 → 양쪽 글이 모두 보임)
 */
/** PostgREST `and=(or(상태),or(카테고리열))` — `.or()` 를 두 번 체이닝하면 `or` 쿼리 키가 덮여 AND 가 깨질 수 있음 */
function buildTradeFeedAndFilter(ids: string[]): string {
  const cleaned = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (cleaned.length === 0) return "";
  const csv = cleaned.join(",");
  const statusOr = "status.is.null,status.not.in.(hidden,sold)";
  const categoryOr = `trade_category_id.in.(${csv}),category_id.in.(${csv})`;
  return `(or(${statusOr}),or(${categoryOr}))`;
}

/** Supabase 클라이언트(브라우저·서버) 공통 — 내부 구현 타입 회피용 any */
export async function fetchPostsRangeForTradeCategories(
  supabase: unknown,
  ids: string[],
  sort: TradePostSort,
  rangeFrom: number,
  rangeToInclusive: number
): Promise<PostWithMeta[]> {
  if (!supabase) return [];
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => unknown;
    };
  };
  const andGroup = buildTradeFeedAndFilter(ids);
  if (!andGroup) return [];

  const run = async (selectCols: string) => {
    let q = (sb.from(POSTS_TABLE_READ) as any).select(selectCols);
    applyPostgrestAndGroup(q, andGroup);
    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }
    return q.range(rangeFrom, rangeToInclusive);
  };
  try {
    let selectCols = POST_TRADE_LIST_SELECT;
    let { data, error } = await run(selectCols);
    if (error && looksLikeMissingColumnOrSchemaError(error.message)) {
      selectCols = "*";
      const res = await run(selectCols);
      data = res.data;
      error = res.error;
    }
    /** 스키마에 category_id 가 없는 경우 trade_category_id 만 사용 */
    if (error && typeof error?.message === "string" && /category_id/i.test(error.message)) {
      const csv = [...new Set(ids.map((x) => x.trim()).filter(Boolean))].join(",");
      const fallbackAnd = `(or(status.is.null,status.not.in.(hidden,sold)),or(trade_category_id.in.(${csv})))`;
      let q = (sb.from(POSTS_TABLE_READ) as any).select(selectCols);
      applyPostgrestAndGroup(q, fallbackAnd);
      if (sort === "latest") {
        q = q.order("created_at", { ascending: false });
      } else {
        q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
      }
      const res = await q.range(rangeFrom, rangeToInclusive);
      data = res.data;
      error = res.error;
    }
    if (error || !Array.isArray(data)) return [];
    return mapPostRowsToTradeList(data);
  } catch {
    return [];
  }
}
