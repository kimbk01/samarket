import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { batchNicknamesByUserIds } from "@/lib/admin-reviews/batch-nicknames-server";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 거래 흐름(product_chats) + 온도 로그 샘플 — 관리자(테스트 계정 또는 profiles.role)
 * POST (관리자 세션)
 */
export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }

  const anon = createClient(supabaseEnv.url, supabaseEnv.anonKey);

  const sb = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : anon;
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: sessions, error: sErr } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, last_message_at, last_message_preview, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(200);

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
  try {
    const { data: logs } = await sbAny
      .from("reputation_logs")
      .select("id, user_id, source_type, source_id, delta, status, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    reputationLogs = logs ?? [];
  } catch {
    reputationLogs = [];
  }

  let transactionReviews: unknown[] = [];
  try {
    const { data: rev } = await sbAny
      .from("transaction_reviews")
      .select(
        "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, positive_tag_keys, negative_tag_keys, review_comment, is_anonymous_negative, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(60);
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
    transactionReviews = raw.map((r) => {
      const post = postById.get(r.product_id);
      const title = chatProductSummaryFromPostRow(post, r.product_id).title;
      return {
        ...r,
        product_title: title,
        reviewer_nickname: nick[r.reviewer_id] ?? r.reviewer_id.slice(0, 8) + "…",
        reviewee_nickname: nick[r.reviewee_id] ?? r.reviewee_id.slice(0, 8) + "…",
        positive_tag_labels: formatAdminReviewTagKeys(r.role_type, r.positive_tag_keys),
        negative_tag_labels: formatAdminReviewTagKeys(r.role_type, r.negative_tag_keys),
      };
    });
  } catch {
    transactionReviews = [];
  }

  return NextResponse.json({ sessions: rows, reputationLogs, transactionReviews });
}
