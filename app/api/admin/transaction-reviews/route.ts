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
import {
  ADMIN_TRANSACTION_REVIEW_SELECT_FIELDS,
  enrichAdminTransactionReviews,
  listAdminTransactionReviewRows,
  parseAdminTransactionReviewsListParams,
} from "@/lib/admin-reviews/admin-transaction-reviews-list";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_FIELDS = ADMIN_TRANSACTION_REVIEW_SELECT_FIELDS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 서비스 롤/anon 클라이언트 공용 (스키마 제네릭 없음)
type AdminReviewsDb = import("@supabase/supabase-js").SupabaseClient<any>;
// Production has no transaction_reviews.is_hidden_by_admin — omit from SELECT.

/**
 * 목록 (R7 목록 표준) — query/body: limit(20/50/100, 그 외 50) · offset · q · status · rating · role
 * → `{ ok, reviews, total(count: "exact"), limit, offset }`. DB 에서 필터·페이지 (고정 500건 상한 없음).
 */
async function listResponse(sbAny: AdminReviewsDb, sp: URLSearchParams) {
  const params = parseAdminTransactionReviewsListParams(sp);
  const listed = await listAdminTransactionReviewRows(sbAny, params);
  if (!listed.ok) return NextResponse.json({ ok: false, error: listed.error }, { status: 500 });
  const reviews = await enrichAdminTransactionReviews(sbAny, listed.rows);
  return NextResponse.json({ ok: true, reviews, total: listed.total, limit: params.limit, offset: params.offset });
}

function adminReviewsClient() {
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) return { ok: false as const, error: supabaseEnv.error };
  const anon = createClient(supabaseEnv.url, supabaseEnv.anonKey);
  const sb = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : anon;
  return { ok: true as const, sbAny: sb as AdminReviewsDb };
}

/** GET 목록 — 관리자 「거래 후기」 화면 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const client = adminReviewsClient();
  if (!client.ok) return NextResponse.json({ ok: false, error: client.error }, { status: 500 });
  return listResponse(client.sbAny, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const client = adminReviewsClient();
  if (!client.ok) {
    return NextResponse.json({ error: client.error }, { status: 500 });
  }

  let body: { reviewId?: string; limit?: unknown; offset?: unknown; q?: unknown; status?: unknown; rating?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }
  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";

  const sbAny = client.sbAny;

  if (reviewId) {
    const { data: row, error } = await sbAny
      .from("transaction_reviews")
      .select(SELECT_FIELDS)
      .eq("id", reviewId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

  // 목록 (본문 키 = GET 쿼리 키)
  const sp = new URLSearchParams();
  for (const k of ["limit", "offset", "q", "status", "rating", "role"] as const) {
    const v = body[k];
    if (typeof v === "string" || typeof v === "number") sp.set(k, String(v));
  }
  return listResponse(sbAny, sp);
}
