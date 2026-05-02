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
import {
  buildTradePostsStatusAndCategoryAndFilter,
  buildTradePostsStatusAndTradeCategoryOnlyAndFilter,
} from "./trade-posts-category-filter";

/** listing_kind 필터 시 DB를 순차 스캔하는 최대 청크 수(getPostsByCategory 와 동일) */
export const MAX_JOB_LISTING_KIND_CHUNKS = 120;

export const PAGE_SIZE_TRADE_FEED = 20;

/**
 * 목록 카드용 — `content` 등 대용량 텍스트 제외.
 * 일부 DB에 컬럼이 없으면 PostgREST 오류 → `select('*')` 폴백.
 */
/**
 * --- `POST_TRADE_LIST_SELECT` vs 운영 PostgREST `posts` ---
 * 컬럼 집합은 프로젝트 Supabase `GET /rest/v1/` + `Accept: application/openapi+json` 의
 * `definitions.posts.properties` 키와 대조(저장소 DDL 없음).
 */
/** `author_id` 는 일부 Supabase `posts` 스키마에 없음 — 없으면 PostgREST 전체 select 실패. 앱에서는 `user_id`로 `author_id` 보강 */
export const POST_TRADE_LIST_SELECT =
  "id, user_id, type, title, price, is_price_offer, is_free_share, region, city, status, seller_listing_state, reserved_buyer_id, sold_buyer_id, view_count, thumbnail_url, images, meta, created_at, updated_at, trade_category_id, favorite_count, chat_count, trade_type, job_employment_type, job_category, pay_type, pay_amount, work_start_date, work_end_date, work_days, work_start_time, work_end_time, headcount, experience_required, application_count";

export function looksLikeMissingColumnOrSchemaError(message: string | undefined | null): boolean {
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
    const tt = row.trade_type;
    const trade_type =
      tt === "job" || tt === "product"
        ? tt
        : typeof tt === "string" && tt.trim()
          ? (tt.trim() as "job" | "product")
          : "product";
    const application_count_raw = row.application_count;
    const application_count =
      typeof application_count_raw === "number"
        ? application_count_raw
        : application_count_raw != null
          ? Number(application_count_raw)
          : undefined;
    return {
      ...p,
      author_id,
      category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
      trade_type,
      job_employment_type:
        row.job_employment_type != null ? String(row.job_employment_type) : undefined,
      job_category: row.job_category != null ? String(row.job_category) : undefined,
      pay_type: row.pay_type != null ? String(row.pay_type) : undefined,
      pay_amount:
        row.pay_amount != null && row.pay_amount !== ""
          ? Number(row.pay_amount)
          : undefined,
      work_start_date:
        row.work_start_date != null ? String(row.work_start_date) : undefined,
      work_end_date:
        row.work_end_date != null ? String(row.work_end_date) : undefined,
      work_days: Array.isArray(row.work_days) ? (row.work_days as string[]) : undefined,
      work_start_time:
        row.work_start_time != null ? String(row.work_start_time) : undefined,
      work_end_time:
        row.work_end_time != null ? String(row.work_end_time) : undefined,
      headcount:
        row.headcount != null && row.headcount !== ""
          ? Number(row.headcount)
          : undefined,
      experience_required:
        row.experience_required != null ? String(row.experience_required) : undefined,
      application_count:
        application_count != null && !Number.isNaN(application_count)
          ? application_count
          : undefined,
    } as PostWithMeta;
  });
}

export type TradePostSort = "latest" | "popular" | "pay_desc";

export type TradeFeedQueryExtras = {
  /** 마켓 부모가 알바 메뉴일 때 서버가 좁힘 */
  restrictTradeTypeJob?: boolean;
  jobEmploymentType?: string;
  /** 근무 시작일 ≤ 오늘 ≤ 근무 종료일(또는 종료일 없음) */
  todayAvailable?: boolean;
};

function buildTradeFeedAndFilter(ids: string[]): string {
  return buildTradePostsStatusAndCategoryAndFilter(ids);
}

/** Supabase 클라이언트(브라우저·서버) 공통 — 내부 구현 타입 회피용 any */
export async function fetchPostsRangeForTradeCategories(
  supabase: unknown,
  ids: string[],
  sort: TradePostSort,
  rangeFrom: number,
  rangeToInclusive: number,
  extras?: TradeFeedQueryExtras
): Promise<PostWithMeta[]> {
  if (!supabase) return [];
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => unknown;
    };
  };
  const andGroup = buildTradeFeedAndFilter(ids);
  if (!andGroup) return [];

  const applyJobFilters = (q: any) => {
    let q2 = q;
    if (extras?.restrictTradeTypeJob) {
      q2 = q2.eq("trade_type", "job");
    }
    const je = extras?.jobEmploymentType?.trim();
    if (je) {
      q2 = q2.eq("trade_type", "job").eq("job_employment_type", je);
    }
    if (extras?.todayAvailable) {
      const today = new Date().toISOString().slice(0, 10);
      q2 = q2
        .eq("trade_type", "job")
        .lte("work_start_date", today)
        .or(`work_end_date.is.null,work_end_date.gte.${today}`);
    }
    return q2;
  };

  const applySort = (q: any) => {
    if (sort === "latest") {
      return q.order("created_at", { ascending: false });
    }
    if (sort === "pay_desc") {
      return q.order("pay_amount", { ascending: false }).order("created_at", { ascending: false });
    }
    return q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
  };

  const run = async (selectCols: string) => {
    let q = (sb.from(POSTS_TABLE_READ) as any).select(selectCols);
    applyPostgrestAndGroup(q, andGroup);
    q = applyJobFilters(q);
    q = applySort(q);
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
      const fallbackAnd = buildTradePostsStatusAndTradeCategoryOnlyAndFilter(ids);
      if (!fallbackAnd) return [];
      let q = (sb.from(POSTS_TABLE_READ) as any).select(selectCols);
      applyPostgrestAndGroup(q, fallbackAnd);
      q = applyJobFilters(q);
      q = applySort(q);
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
