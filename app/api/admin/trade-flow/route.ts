import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { batchNicknamesByUserIds } from "@/lib/admin-reviews/batch-nicknames-server";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 본문 페이지 값 (20/50/100 만, 그 외 50) · offset ≥ 0 */
function pageOf(body: Record<string, unknown>, limitKey: string, offsetKey: string): { limit: number; offset: number } {
  const limit = normalizeAdminListPageSize(body[limitKey], 50);
  const o = Math.floor(Number(body[offsetKey]));
  return { limit, offset: Number.isFinite(o) && o > 0 ? Math.min(o, ADMIN_LIST_MAX_OFFSET) : 0 };
}

/**
 * 거래 흐름(product_chats) + 거래 후기 + 온도 기록 — 활성 관리자 (거래 Admin O-2)
 * POST (관리자 세션)
 * R7 목록 표준: 본문에 `limit` 이 있으면 세 목록을 각각 서버 페이지로 돌려준다 (`count: "exact"`).
 *   거래 세션 `limit`·`offset` (+ 딥링크 `postId`·`productChatId` 를 DB 조건으로) → `sessionsTotal`
 *   거래 후기 `reviewsLimit`·`reviewsOffset` → `reviewsTotal` · 온도 기록 `logsLimit`·`logsOffset` → `logsTotal`
 *   (limit 은 20/50/100 만, 그 외 50). `limit` 이 없으면 예전 응답(세션 200 · 기록 80 · 후기 60) 그대로.
 */
export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  // 서비스 롤만 사용 (D-40: 익명 키 대체 조회 제거) — 게이트가 서비스 클라이언트를 준다
  const sb = admin.sb;
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const paged = body.limit !== undefined && body.limit !== null;
  const sessionPage = paged ? pageOf(body, "limit", "offset") : { limit: 200, offset: 0 };
  const reviewPage = paged ? pageOf(body, "reviewsLimit", "reviewsOffset") : { limit: 60, offset: 0 };
  const logPage = paged ? pageOf(body, "logsLimit", "logsOffset") : { limit: 80, offset: 0 };
  const idOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 64) : "");
  const deepPostId = paged ? idOf(body.postId) : "";
  const deepProductChatId = paged ? idOf(body.productChatId) : "";

  let sessionQuery = sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, last_message_at, last_message_preview, updated_at",
      { count: "exact" }
    );
  // 딥링크: 거래글이 있으면 그 글의 세션 전부(화면이 productChatId 를 다시 고른다), 세션 번호만 있으면 그 세션
  if (deepPostId) sessionQuery = sessionQuery.eq("post_id", deepPostId);
  else if (deepProductChatId) sessionQuery = sessionQuery.eq("id", deepProductChatId);
  const { data: sessions, error: sErr, count: sessionsTotal } = await sessionQuery
    .order("updated_at", { ascending: false })
    .range(sessionPage.offset, sessionPage.offset + sessionPage.limit - 1);

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  const sessList = sessions ?? [];
  const postIds = [...new Set(sessList.map((r: { post_id: string }) => r.post_id))];
  const postMetaById: Record<string, { title: string; status: string; sellerListingState: string | null }> = {};
  if (postIds.length) {
    const { data: posts } = await sbAny
      .from(POSTS_TABLE_READ)
      .select("id, title, status, seller_listing_state")
      .in("id", postIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (!id) return;
      postMetaById[id] = {
        title: String(p.title ?? id),
        status: String(p.status ?? ""),
        sellerListingState: p.seller_listing_state != null ? String(p.seller_listing_state) : null,
      };
    });
  }

  const roomIds = sessList.map((r: { id: string }) => r.id).filter(Boolean);
  const buyerReviewRooms = new Set<string>();
  if (roomIds.length) {
    const { data: revRows } = await sbAny
      .from("transaction_reviews")
      .select("room_id")
      .eq("role_type", "buyer_to_seller")
      .in("room_id", roomIds);
    (revRows ?? []).forEach((x: { room_id: string }) => {
      if (x.room_id) buyerReviewRooms.add(x.room_id);
    });
  }

  const rows = sessList.map((r: Record<string, unknown>) => {
    const pid = r.post_id as string;
    const meta = postMetaById[pid];
    const rid = r.id as string;
    return {
      ...r,
      postTitle: meta?.title ?? pid,
      postStatus: meta?.status ?? "",
      sellerListingState: meta?.sellerListingState ?? null,
      hasBuyerReview: buyerReviewRooms.has(rid),
    };
  });

  let reputationLogs: unknown[] = [];
  let logsTotal: number | null = null;
  try {
    const { data: logs, count } = await sbAny
      .from("reputation_logs")
      .select("id, user_id, source_type, source_id, delta, status, reason, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(logPage.offset, logPage.offset + logPage.limit - 1);
    reputationLogs = logs ?? [];
    logsTotal = typeof count === "number" ? count : null;
  } catch {
    reputationLogs = [];
  }

  let transactionReviews: unknown[] = [];
  let reviewsTotal: number | null = null;
  try {
    const { data: rev, count } = await sbAny
      .from("transaction_reviews")
      .select(
        "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, positive_tag_keys, negative_tag_keys, review_comment, is_anonymous_negative, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(reviewPage.offset, reviewPage.offset + reviewPage.limit - 1);
    reviewsTotal = typeof count === "number" ? count : null;
    const raw = (rev ?? []) as Array<{
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
      is_anonymous_negative?: boolean | null;
      created_at: string;
    }>;
    const pids = [...new Set(raw.map((r) => r.product_id).filter(Boolean))];
    const uids = [...new Set(raw.flatMap((r) => [r.reviewer_id, r.reviewee_id]).filter(Boolean))];
    const postById = new Map<string, Record<string, unknown>>();
    if (pids.length) {
      const { data: posts } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", pids);
      (posts ?? []).forEach((p: Record<string, unknown>) => {
        const id = String(p.id ?? "");
        if (id) postById.set(id, p);
      });
    }
    const nick = await batchNicknamesByUserIds(sbAny, uids);
    const adminT = (key: MessageKey) => translate("ko", key);
    transactionReviews = raw.map((r) => {
      const post = postById.get(r.product_id);
      const title = chatProductSummaryFromPostRow(post, r.product_id).title;
      return {
        ...r,
        product_title: title,
        reviewer_nickname: nick[r.reviewer_id] ?? r.reviewer_id.slice(0, 8) + "…",
        reviewee_nickname: nick[r.reviewee_id] ?? r.reviewee_id.slice(0, 8) + "…",
        positive_tag_labels: formatAdminReviewTagKeys(adminT, r.role_type, r.positive_tag_keys),
        negative_tag_labels: formatAdminReviewTagKeys(adminT, r.role_type, r.negative_tag_keys),
      };
    });
  } catch {
    transactionReviews = [];
  }

  if (!paged) return NextResponse.json({ sessions: rows, reputationLogs, transactionReviews });
  return NextResponse.json({
    ok: true,
    sessions: rows,
    sessionsTotal: typeof sessionsTotal === "number" ? sessionsTotal : rows.length,
    limit: sessionPage.limit,
    offset: sessionPage.offset,
    reputationLogs,
    logsTotal,
    transactionReviews,
    reviewsTotal,
  });
}
