import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { normalizePostImages } from "@/lib/posts/post-normalize";
import { getLocationLabelIfValid } from "@/lib/products/form-options";

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

  const posts = (rows ?? []).map((r: Record<string, unknown>): MyPostListRow => {
    const region = String(r.region ?? "").trim();
    const city = String(r.city ?? "").trim();
    const locLine = getLocationLabelIfValid(region, city)?.trim() ?? "";
    const fromImages = normalizePostImages(r.images) ?? [];
    const thumbCol =
      typeof r.thumbnail_url === "string" && r.thumbnail_url.trim().length > 0
        ? r.thumbnail_url.trim()
        : "";
    const thumbnail = thumbCol || fromImages[0] || "";
    return {
      id: r.id,
      title: (r.title as string) ?? "",
      description: (r.content as string) ?? "",
      price: Number(r.price) ?? 0,
      status: (r.status as string) ?? "active",
      sellerListingState: (r.seller_listing_state as string) ?? undefined,
      thumbnail,
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
  });

  return { ok: true, posts };
}
