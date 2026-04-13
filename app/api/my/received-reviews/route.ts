/**
 * 내가 받은 거래 후기 (transaction_reviews.reviewee_id = 세션)
 * GET /api/my/received-reviews
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export async function GET(_req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: rows, error } = await sbAny
    .from("transaction_reviews")
    .select(
      "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, positive_tag_keys, negative_tag_keys, review_comment, is_anonymous_negative, created_at"
    )
    .eq("reviewee_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
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
  const reviewerIds = [...new Set(list.map((r) => r.reviewer_id).filter(Boolean))];

  const postById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: posts } = await sbAny.from("posts").select(POST_TRADE_RELATION_SELECT).in("id", productIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (id) postById.set(id, p);
    });
    const missing = productIds.filter((id) => !postById.has(id));
    for (const mid of missing.slice(0, 30)) {
      const { data: one } = await sbAny.from("posts").select(POST_TRADE_RELATION_SELECT).eq("id", mid).maybeSingle();
      if (one) postById.set(String(mid), one as Record<string, unknown>);
    }
  }

  const nickById = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", reviewerIds);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      const n = String((p.nickname ?? p.username ?? "") as string).trim();
      if (id && n) nickById.set(id, n);
    });
    const needTest = reviewerIds.filter((id) => !nickById.has(id));
    if (needTest.length) {
      const { data: tus } = await sbAny
        .from("test_users")
        .select("id, display_name, username")
        .in("id", needTest);
      (tus ?? []).forEach((t: Record<string, unknown>) => {
        const id = String(t.id ?? "");
        const n = String((t.display_name ?? t.username ?? "") as string).trim();
        if (id && n) nickById.set(id, n);
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
      reviewerId: r.reviewer_id,
      reviewerNickname: nickById.get(r.reviewer_id) ?? r.reviewer_id.slice(0, 8) + "…",
      roleType: r.role_type,
      publicReviewType: pt,
      positiveTagKeys: Array.isArray(r.positive_tag_keys) ? r.positive_tag_keys : [],
      negativeTagKeys: Array.isArray(r.negative_tag_keys) ? r.negative_tag_keys : [],
      comment: typeof r.review_comment === "string" ? r.review_comment : "",
      isAnonymousNegative: !!r.is_anonymous_negative,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ items });
}
