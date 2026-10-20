import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { batchNicknamesByUserIds, batchUserIdentityByUserIds } from "@/lib/admin-reviews/batch-nicknames-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  mapTransactionReviewRowToAdminReview,
  type TransactionReviewDbRow,
} from "@/lib/admin-reviews/map-transaction-review-to-admin";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_FIELDS =
  "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, private_manner_score, private_tags, is_anonymous_negative, created_at, positive_tag_keys, negative_tag_keys, review_comment";
// Production has no transaction_reviews.is_hidden_by_admin — omit from SELECT.

/** 이전 목록 동작(페이지 파라미터 없음) — 최신 500건 */
const LEGACY_LIST_LIMIT = 500;
const MAX_OFFSET = 100_000;
const SEARCH_ID_CAP = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ListBody = {
  reviewId?: string;
  /** 있으면 서버 페이지 모드: 20/50/100 (그 외 50) */
  limit?: unknown;
  offset?: unknown;
  /** visible | hidden | reported (숨김 컬럼이 없는 운영 DB 에서는 모든 후기가 visible) */
  reviewStatus?: unknown;
  /** 1~5 (공개 평가 good=5 · normal=3 · bad=1) */
  rating?: unknown;
  role?: unknown;
  q?: unknown;
};

/** PostgREST or() 필터에 넣을 검색어 — 구분자·와일드카드 제거 */
function safeSearchTerm(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[,()*%\\"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }

  let body: ListBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }
  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";

  const anon = createClient(supabaseEnv.url, supabaseEnv.anonKey);

  const sb = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : anon;
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  if (reviewId) {
    const { data: row, error } = await sbAny
      .from("transaction_reviews")
      .select(SELECT_FIELDS)
      .eq("id", reviewId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ review: null });
    }
    const r = row as TransactionReviewDbRow;
    const { data: post } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", r.product_id).maybeSingle();
    const postRow = (post as Record<string, unknown> | null) ?? undefined;
    const nick = await batchNicknamesByUserIds(sbAny, [r.reviewer_id, r.reviewee_id]);
    const identityById = await batchUserIdentityByUserIds(sbAny, [r.reviewer_id, r.reviewee_id]);
    const review = mapTransactionReviewRowToAdminReview(r, postRow, nick);
    review.reviewerUsername = identityById[r.reviewer_id]?.username ?? null;
    review.reviewerDisplayName = identityById[r.reviewer_id]?.displayName ?? null;
    review.targetUsername = identityById[r.reviewee_id]?.username ?? null;
    review.targetDisplayName = identityById[r.reviewee_id]?.displayName ?? null;
    const role = review.role;
    const sellerId = role === "seller_to_buyer" ? r.reviewer_id : r.reviewee_id;
    const buyerId = role === "buyer_to_seller" ? r.reviewer_id : r.reviewee_id;
    review.sellerUsername = identityById[sellerId]?.username ?? null;
    review.buyerUsername = identityById[buyerId]?.username ?? null;
    return NextResponse.json({ review });
  }

  /*
   * 목록 — body.limit 이 있으면 서버 페이지(20/50/100 · offset · 조건 · total exact).
   * 없으면 이전 동작 그대로(최신 500건, 조건 없음 · total 은 반환 행 수).
   */
  const paged = body.limit !== undefined && body.limit !== null && body.limit !== "";
  const limit = paged ? normalizeAdminListPageSize(String(body.limit), 50) : LEGACY_LIST_LIMIT;
  const offsetRaw = Math.floor(Number(body.offset));
  const offset = paged && Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.min(offsetRaw, MAX_OFFSET) : 0;
  const empty = () => NextResponse.json({ reviews: [], total: 0, limit, offset });

  let query = sbAny.from("transaction_reviews").select(SELECT_FIELDS, paged ? { count: "exact" } : undefined);
  if (paged) {
    const status = String(body.reviewStatus ?? "");
    // 운영 DB 에는 관리자 숨김 컬럼이 없어 모든 후기가 「노출」 — 숨김·신고됨 조건은 결과 없음 (이전 화면 필터와 같은 결과)
    if (status === "hidden" || status === "reported") return empty();
    const role = String(body.role ?? "");
    if (role === "buyer_to_seller" || role === "seller_to_buyer") query = query.eq("role_type", role);
    const rating = Number(body.rating);
    if (body.rating !== undefined && body.rating !== null && body.rating !== "" && Number.isFinite(rating)) {
      const type = rating === 5 ? "good" : rating === 3 ? "normal" : rating === 1 ? "bad" : null;
      if (!type) return empty();
      query = query.eq("public_review_type", type);
    }
    const q = safeSearchTerm(body.q);
    if (q) {
      // 이전 화면 검색과 같은 대상: 상품명 · 작성자·대상자 닉네임 · 거래(채팅방) ID · 후기 내용
      const like = `%${q}%`;
      const [postsHit, usersHit] = await Promise.all([
        sbAny.from(POSTS_TABLE_READ).select("id").ilike("title", like).limit(SEARCH_ID_CAP),
        sbAny
          .from("profiles")
          .select("id")
          .or(`display_name.ilike.${like},nickname.ilike.${like},username.ilike.${like}`)
          .limit(SEARCH_ID_CAP),
      ]);
      const postIds = ((postsHit.data ?? []) as { id: unknown }[]).map((r) => String(r.id)).filter((id) => UUID_RE.test(id));
      const userIds = ((usersHit.data ?? []) as { id: unknown }[]).map((r) => String(r.id)).filter((id) => UUID_RE.test(id));
      const ors = [`review_comment.ilike.${like}`];
      if (UUID_RE.test(q)) ors.push(`room_id.eq.${q}`);
      if (postIds.length) ors.push(`product_id.in.(${postIds.join(",")})`);
      if (userIds.length) {
        ors.push(`reviewer_id.in.(${userIds.join(",")})`);
        ors.push(`reviewee_id.in.(${userIds.join(",")})`);
      }
      query = query.or(ors.join(","));
    }
  }

  const { data: rows, error: listErr, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (listErr) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const list = (rows ?? []) as TransactionReviewDbRow[];
  const productIds = [...new Set(list.map((x) => x.product_id).filter(Boolean))];
  const userIds = [...new Set(list.flatMap((x) => [x.reviewer_id, x.reviewee_id]).filter(Boolean))];

  const postById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: posts } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", productIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (id) postById.set(id, p);
    });
    const missing = productIds.filter((id) => !postById.has(id));
    for (const mid of missing.slice(0, 40)) {
      const { data: one } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", mid).maybeSingle();
      if (one) postById.set(String(mid), one as Record<string, unknown>);
    }
  }

  const nicknameById = await batchNicknamesByUserIds(sbAny, userIds);
  const identityById = await batchUserIdentityByUserIds(sbAny, userIds);
  const reviews = list.map((r) =>
    mapTransactionReviewRowToAdminReview(r, postById.get(r.product_id), nicknameById)
  );
  reviews.forEach((review) => {
    review.reviewerUsername = identityById[review.reviewerId]?.username ?? null;
    review.reviewerDisplayName = identityById[review.reviewerId]?.displayName ?? null;
    review.targetUsername = identityById[review.targetUserId]?.username ?? null;
    review.targetDisplayName = identityById[review.targetUserId]?.displayName ?? null;
    const role = review.role;
    const sellerId = role === "seller_to_buyer" ? review.reviewerId : review.targetUserId;
    const buyerId = role === "buyer_to_seller" ? review.reviewerId : review.targetUserId;
    review.sellerUsername = identityById[sellerId]?.username ?? null;
    review.buyerUsername = identityById[buyerId]?.username ?? null;
  });

  return NextResponse.json({
    reviews,
    total: paged ? (typeof count === "number" ? count : reviews.length) : reviews.length,
    limit,
    offset,
  });
}
