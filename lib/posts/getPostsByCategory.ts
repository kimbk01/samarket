"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";
import {
  postMetaMatchesJobListingKind,
  type JobListingKindFilter,
} from "@/lib/jobs/matches-job-listing-kind";

export type PostSort = "latest" | "popular";

const PAGE_SIZE = 20;

/** listing_kind 필터 시 DB를 순차 스캔하는 최대 청크 수(성능 상한) */
const MAX_JOB_LISTING_KIND_CHUNKS = 120;

/**
 * 목록 카드용 — `content` 등 대용량 텍스트 제외(전송·역직렬화 비용 절감).
 * 일부 DB에 컬럼이 없으면 PostgREST 오류 → `select('*')` 폴백.
 */
const POST_TRADE_LIST_SELECT =
  "id, user_id, author_id, type, title, price, is_price_offer, is_free_share, region, city, contact_method, status, seller_listing_state, reserved_buyer_id, view_count, thumbnail_url, images, meta, created_at, updated_at, trade_category_id, favorite_count, comment_count, chat_count, author_nickname, board_id, service_id, visibility";

function looksLikeMissingColumnOrSchemaError(message: string | undefined | null): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    /could not find|does not exist|unknown column|schema cache|42703/i.test(m) ||
    /column .* of relation ['"]posts['"]/i.test(m)
  );
}

export interface GetPostsByCategoryOptions {
  page?: number;
  sort?: PostSort;
  /** 알바 카테고리 전용: 구인/구직 메타 필터(페이지마다 DB를 여러 번 읽을 수 있음) */
  jobsListingKind?: JobListingKindFilter;
}

export interface GetPostsByCategoryResult {
  posts: PostWithMeta[];
  hasMore: boolean;
}

function mapPostRows(data: unknown[]): PostWithMeta[] {
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

async function fetchPostsRangeForTradeCategories(
  supabase: ReturnType<typeof getSupabaseClient>,
  ids: string[],
  sort: PostSort,
  rangeFrom: number,
  rangeToInclusive: number
): Promise<PostWithMeta[]> {
  if (!supabase) return [];
  const sb = supabase as any;
  const run = async (useTradeCol: boolean, selectCols: string) => {
    let q = sb
      .from("posts")
      .select(selectCols)
      /** NULL status 레거시 행 포함 — `.neq` 만 쓰면 SQL에서 NULL 행이 빠짐 */
      .or("status.is.null,status.not.in.(hidden,sold)");
    q = useTradeCol ? q.in("trade_category_id", ids) : q.in("category_id", ids);
    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }
    return q.range(rangeFrom, rangeToInclusive);
  };
  try {
    let selectCols = POST_TRADE_LIST_SELECT;
    let { data, error } = await run(true, selectCols);
    if (error && looksLikeMissingColumnOrSchemaError(error.message)) {
      selectCols = "*";
      const res = await run(true, selectCols);
      data = res.data;
      error = res.error;
    }
    if (error && typeof error?.message === "string" && error.message.includes("trade_category_id")) {
      const res = await run(false, selectCols);
      data = res.data;
      error = res.error;
    }
    if (error || !Array.isArray(data)) return [];
    return mapPostRows(data);
  } catch {
    return [];
  }
}

/** trade_category_id / category_id 중 하나로 여러 카테고리 OR 조회 */
export async function getPostsByTradeCategoryIds(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  const supabase = getSupabaseClient();
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
  if (!supabase || ids.length === 0) {
    return { posts: [], hasMore: false };
  }

  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const jobKind = options.jobsListingKind;

  if (jobKind === "hire" || jobKind === "work") {
    const targetStart = (page - 1) * PAGE_SIZE;
    const targetEnd = targetStart + PAGE_SIZE;
    let matchIndex = 0;
    const out: PostWithMeta[] = [];
    let dbOffset = 0;
    let lastChunkLen = PAGE_SIZE;
    let chunks = 0;

    try {
      while (out.length < PAGE_SIZE && lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS) {
        const chunk = await fetchPostsRangeForTradeCategories(
          supabase,
          ids,
          sort,
          dbOffset,
          dbOffset + PAGE_SIZE - 1
        );
        lastChunkLen = chunk.length;
        chunks++;
        for (const p of chunk) {
          const meta =
            p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
              ? (p.meta as Record<string, unknown>)
              : undefined;
          if (!postMetaMatchesJobListingKind(meta, jobKind)) continue;
          if (matchIndex >= targetStart && matchIndex < targetEnd) {
            out.push(p);
          }
          matchIndex++;
        }
        dbOffset += chunk.length;
        if (chunk.length < PAGE_SIZE) break;
      }
      const hasMore =
        lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS;
      return { posts: out, hasMore };
    } catch {
      return { posts: [], hasMore: false };
    }
  }

  const from = (page - 1) * PAGE_SIZE;

  try {
    const posts = await fetchPostsRangeForTradeCategories(supabase, ids, sort, from, from + PAGE_SIZE - 1);
    return { posts, hasMore: posts.length === PAGE_SIZE };
  } catch {
    return { posts: [], hasMore: false };
  }
}

export async function getPostsByCategory(
  categoryId: string,
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  if (!categoryId?.trim()) return { posts: [], hasMore: false };
  return getPostsByTradeCategoryIds([categoryId.trim()], options);
}
