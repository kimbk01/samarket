import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내가 작성한 거래 후기 (transaction_reviews.reviewer_id = 세션)
 * GET /api/my/written-reviews
 *
 * 페이지 모드(최종 설계 C.0.3 A3): `?limit=20&cursor=<created_at|id>` → `{ items, next_cursor, total? }`
 * (`total` 은 첫 페이지만 — 탭 개수). 무인자 = 현행 최근 100건 `{ items }` 그대로.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import {
  mypageKeysetOrFilter,
  parseMypageListCursor,
  parseMypageListLimit,
  sliceMypageKeysetPage,
} from "@/lib/mypage/mypage-list-cursor";

export async function GET(req: NextRequest) {
  const sp = req?.nextUrl?.searchParams ?? new URLSearchParams();
  const pageLimit = parseMypageListLimit(sp.get("limit"));
  const rawCursor = sp.get("cursor");
  const cursor = parseMypageListCursor(rawCursor);
  if (pageLimit != null && rawCursor && rawCursor.trim() && !cursor) {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  let q = sbAny
    .from("transaction_reviews")
    .select(
      "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, positive_tag_keys, negative_tag_keys, review_comment, is_anonymous_negative, created_at"
    )
    .eq("reviewer_id", userId)
    .order("created_at", { ascending: false });
  if (pageLimit != null) {
    q = q.order("id", { ascending: false }).limit(pageLimit + 1);
    if (cursor) q = q.or(mypageKeysetOrFilter(cursor, "created_at"));
  } else {
    q = q.limit(100);
  }
  const { data: rawRows, error } = await q;

  if (error) {
    return NextResponse.json({ error: pageLimit != null ? "reviews_load_failed" : error.message }, { status: 500 });
  }

  let nextCursor: string | null = null;
  let rows = (rawRows ?? []) as Array<{ id: string; created_at: string }>;
  let total: number | undefined;
  if (pageLimit != null) {
    const page = sliceMypageKeysetPage(rows, pageLimit, (r) => r.created_at, (r) => String(r.id));
    rows = page.items;
    nextCursor = page.next_cursor;
    if (!cursor) {
      const { count, error: countError } = await sbAny
        .from("transaction_reviews")
        .select("id", { count: "exact", head: true })
        .eq("reviewer_id", userId);
      if (countError) return NextResponse.json({ error: "reviews_load_failed" }, { status: 500 });
      total = count ?? 0;
    }
  }

  const list = rows as unknown as Array<{
    id: string;
    product_id: string;
    room_id: string | null;
    reviewer_id: string;
    reviewee_id: string;
    role_type: string;
    public_review_type: string;
    positive_tag_keys: string[] | null;
    negative_tag_keys: string[] | null;
    review_comment: string | null;
    is_anonymous_negative: boolean | null;
    created_at: string;
  }>;

  const productIds = [...new Set(list.map((r) => r.product_id).filter(Boolean))];
  const revieweeIds = [...new Set(list.map((r) => r.reviewee_id).filter(Boolean))];

  const postById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: posts } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", productIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (id) postById.set(id, p);
    });
    const missing = productIds.filter((id) => !postById.has(id));
    for (const mid of missing.slice(0, 30)) {
      const { data: one } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", mid).maybeSingle();
      if (one) postById.set(String(mid), one as Record<string, unknown>);
    }
  }

  const nickById = new Map<string, string>();
  const usernameById = new Map<string, string>();
  if (revieweeIds.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, display_name, nickname, username")
      .in("id", revieweeIds);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      const display = typeof p.display_name === "string" ? p.display_name : null;
      const legacy = typeof p.nickname === "string" ? p.nickname : null;
      const uname = typeof p.username === "string" ? p.username : null;
      const label = labelFromDisplayAndUsername(display ?? legacy, uname).trim();
      if (id && label) nickById.set(id, label);
      if (id && uname && uname.trim()) usernameById.set(id, uname.trim());
    });
    const needTest = revieweeIds.filter((id) => !nickById.has(id));
    if (needTest.length) {
      const { data: tus } = await sbAny
        .from("test_users")
        .select("id, display_name, username")
        .in("id", needTest);
      (tus ?? []).forEach((t: Record<string, unknown>) => {
        const id = String(t.id ?? "");
        const display = typeof t.display_name === "string" ? t.display_name : null;
        const uname = typeof t.username === "string" ? t.username : null;
        const label = labelFromDisplayAndUsername(display, uname).trim() || String((t.display_name ?? t.username ?? "") as string).trim();
        if (id && label) nickById.set(id, label);
        if (id && uname && uname.trim()) usernameById.set(id, uname.trim());
      });
    }
  }

  const items = list.map((r) => {
    const post = postById.get(r.product_id);
    const summary = chatProductSummaryFromPostRow(post, r.product_id);
    const roomId = r.room_id?.trim() ?? "";
    const pt =
      r.public_review_type === "good" || r.public_review_type === "bad" || r.public_review_type === "normal"
        ? r.public_review_type
        : "normal";
    return {
      id: r.id,
      roomId,
      productId: r.product_id,
      title: summary.title,
      thumbnail: summary.thumbnail ?? "",
      price: summary.price ?? 0,
      revieweeId: r.reviewee_id,
      revieweeNickname: nickById.get(r.reviewee_id) ?? r.reviewee_id.slice(0, 8) + "…",
      revieweeUsername: usernameById.get(r.reviewee_id) ?? null,
      roleType: r.role_type,
      publicReviewType: pt,
      positiveTagKeys: Array.isArray(r.positive_tag_keys) ? r.positive_tag_keys : [],
      negativeTagKeys: Array.isArray(r.negative_tag_keys) ? r.negative_tag_keys : [],
      comment: typeof r.review_comment === "string" ? r.review_comment : "",
      isAnonymousNegative: !!r.is_anonymous_negative,
      createdAt: r.created_at,
    };
  });

  if (pageLimit != null) {
    return NextResponse.json({ items, next_cursor: nextCursor, ...(total != null ? { total } : {}) });
  }
  return NextResponse.json({ items });
}
