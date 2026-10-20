import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { normalizePostImages } from "@/lib/posts/post-normalize";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import {
  collectActivePromotionTargetIds,
  filterMyProductsByListingAxis,
  type MyProductListingFilterKey,
} from "@/lib/products/my-product-listing-filter";
import {
  mypageKeysetOrFilter,
  sliceMypageKeysetPage,
  type MypageListCursor,
} from "@/lib/mypage/mypage-list-cursor";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import type { Product } from "@/lib/types/product";

/** `GET /api/my/posts` 응답 `posts[]` 항목 — 응답 모양 그대로(라우트와 내정보 요약이 공유). */
export type MyPostListRow = {
  id: unknown;
  title: string;
  description: string;
  price: number;
  status: string;
  sellerListingState: string | undefined;
  thumbnail: string;
  images: string[];
  viewCount: number;
  likesCount: number;
  chatCount: number;
  isBoosted: boolean;
  location: string;
  createdAt: string;
  updatedAt: string;
  sellerId: string;
  seller: { id: unknown; nickname: string; avatar: string; location: string; mannerTemp: number };
};

const MY_POSTS_SELECT =
  "id, title, content, price, status, seller_listing_state, images, thumbnail_url, view_count, created_at, updated_at, user_id, region, city";

/**
 * 내상품 목록(본인이 올린 글) — `/api/my/posts` 와 내정보 요약(`salesActiveCount`)의 단일 서버 함수.
 * 조회 실패는 `ok:false` (빈 목록으로 바꾸지 않는다).
 */
export async function loadMyPostsServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; posts: MyPostListRow[] } | { ok: false; error: string }> {
  const { data: rows, error } = await sb
    .from(POSTS_TABLE_READ)
    .select(MY_POSTS_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  const posts = ((rows ?? []) as Record<string, unknown>[]).map(mapMyPostRow);

  return { ok: true, posts };
}

/* ------------------------------------------------------------------------------------------------
 * 페이지 모드(옵트인, 최종 설계 C.0.3 A1 · X23) — `GET /api/my/posts?limit=` 일 때만.
 * 무인자 호출(`loadMyPostsServer`) 응답은 불변.
 * ---------------------------------------------------------------------------------------------- */


/** 서버가 한 번에 읽는 행 수 — 필터 술어 적용 후 `limit` 건을 채울 때까지 반복 */
export const MY_POSTS_PAGE_SCAN_BATCH = 100;

export type MyPostsPageOptions = {
  limit: number;
  cursor: MypageListCursor | null;
  filter: MyProductListingFilterKey;
  promotedOnly: boolean;
};

export type MyPostsPageResult =
  | { ok: true; posts: MyPostListRow[]; next_cursor: string | null }
  | { ok: false; error: string };

function mapMyPostRow(r: Record<string, unknown>): MyPostListRow {
  const region = String(r.region ?? "").trim();
  const city = String(r.city ?? "").trim();
  const locLine = getLocationLabelIfValid(region, city)?.trim() ?? "";
  const fromImages = normalizePostImages(r.images) ?? [];
  const thumbCol =
    typeof r.thumbnail_url === "string" && r.thumbnail_url.trim().length > 0 ? r.thumbnail_url.trim() : "";
  return {
    id: r.id,
    title: (r.title as string) ?? "",
    description: (r.content as string) ?? "",
    price: Number(r.price) ?? 0,
    status: (r.status as string) ?? "active",
    sellerListingState: (r.seller_listing_state as string) ?? undefined,
    thumbnail: thumbCol || fromImages[0] || "",
    images: fromImages,
    viewCount: Number(r.view_count) ?? 0,
    likesCount: 0,
    chatCount: 0,
    isBoosted: false,
    location: locLine,
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
    sellerId: r.user_id as string,
    seller: { id: r.user_id, nickname: "", avatar: "", location: "", mannerTemp: 36.5 },
  };
}

/** `promoted=1` — `/api/me/points/promotion-orders` 와 같은 조회(최근 50건)·같은 활성 판정 */
async function loadActivePromotionTargetIdsServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; ids: Set<string> } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    const msg = String(error.message ?? "");
    // 테이블 미배포 환경 — promotion-orders 라우트와 같은 취급(활성 대상 없음)
    if (isMissingPointsTable(msg, "point_promotion_orders")) return { ok: true, ids: new Set() };
    return { ok: false, error: msg };
  }
  const orders = (data ?? []).map((r) => mapPointPromotionOrderRow(r as Record<string, unknown>));
  return { ok: true, ids: collectActivePromotionTargetIds(orders) };
}

/**
 * 페이지 모드 — `updated_at desc, id desc` keyset 으로 100행씩 읽고 `/mypage/products` 와 **같은 술어**
 * (`filterMyProductsByListingAxis`)를 적용해 `limit` 건을 채운다. 다음 커서 = 마지막 반환 행의 `updated_at|id`.
 */
export async function loadMyPostsPageServer(
  sb: SupabaseClient<any>,
  userId: string,
  opts: MyPostsPageOptions
): Promise<MyPostsPageResult> {
  let promotedIds: Set<string> = new Set();
  if (opts.promotedOnly) {
    const promo = await loadActivePromotionTargetIdsServer(sb, userId);
    if (!promo.ok) return { ok: false, error: promo.error };
    promotedIds = promo.ids;
  }

  const want = opts.limit + 1;
  const matched: MyPostListRow[] = [];
  let scanCursor: MypageListCursor | null = opts.cursor;
  for (;;) {
    let q = sb
      .from(POSTS_TABLE_READ)
      .select(MY_POSTS_SELECT)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MY_POSTS_PAGE_SCAN_BATCH);
    if (scanCursor) q = q.or(mypageKeysetOrFilter(scanCursor, "updated_at"));
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as Record<string, unknown>[];
    const mapped = rows.map(mapMyPostRow);
    const hits = filterMyProductsByListingAxis(
      mapped as unknown as Product[],
      opts.filter,
      opts.promotedOnly,
      promotedIds
    ) as unknown as MyPostListRow[];
    matched.push(...hits);
    if (matched.length >= want || rows.length < MY_POSTS_PAGE_SCAN_BATCH) break;
    const last = rows[rows.length - 1]!;
    scanCursor = { ts: String(last.updated_at ?? ""), id: String(last.id ?? "") };
    if (!scanCursor.ts || !scanCursor.id) break;
  }

  const page = sliceMypageKeysetPage(
    matched,
    opts.limit,
    (p) => p.updatedAt,
    (p) => String(p.id)
  );
  return { ok: true, posts: page.items, next_cursor: page.next_cursor };
}
