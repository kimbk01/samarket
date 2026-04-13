"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { AdminReview } from "@/lib/types/admin-review";
import {
  mapTransactionReviewRowToAdminReview,
  type TransactionReviewDbRow,
} from "@/lib/admin-reviews/map-transaction-review-to-admin";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

const SELECT_FIELDS =
  "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, private_manner_score, private_tags, is_anonymous_negative, created_at, positive_tag_keys, negative_tag_keys, review_comment";

async function batchNicknamesClient(sb: ReturnType<typeof getSupabaseClient>, userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, string> = {};
  if (!ids.length || !sb) return out;
  const s = sb as import("@supabase/supabase-js").SupabaseClient;

  const { data: profiles } = await s.from("profiles").select("id, nickname, username").in("id", ids);
  (profiles ?? []).forEach((p: { id: string; nickname?: string; username?: string }) => {
    const id = String(p.id ?? "");
    if (!id) return;
    const n = String(p.nickname ?? p.username ?? "").trim();
    if (n) out[id] = n;
  });

  const needTest = ids.filter((id) => !out[id]?.trim());
  if (needTest.length) {
    const { data: tus } = await s.from("test_users").select("id, display_name, username").in("id", needTest);
    (tus ?? []).forEach((t: { id: string; display_name?: string; username?: string }) => {
      const id = String(t.id ?? "");
      if (!id) return;
      const n = String(t.display_name ?? t.username ?? "").trim();
      if (n) out[id] = n;
    });
  }

  ids.forEach((id) => {
    if (!out[id]?.trim()) out[id] = id.slice(0, 8) + "…";
  });
  return out;
}

/**
 * 클라이언트 직접 조회 폴백(RLS 허용 시). 목록 화면은 `/api/admin/transaction-reviews` 권장.
 */
export async function getAdminReviewsFromDb(): Promise<AdminReview[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data: rows, error } = await (supabase as any)
      .from("transaction_reviews")
      .select(SELECT_FIELDS)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error || !Array.isArray(rows)) return [];
    const list = rows as TransactionReviewDbRow[];

    const productIds = [...new Set(list.map((r) => r.product_id).filter(Boolean))];
    const userIds = [...new Set(list.flatMap((r) => [r.reviewer_id, r.reviewee_id]).filter(Boolean))];

    const postById = new Map<string, Record<string, unknown>>();
    if (productIds.length) {
      const { data: posts } = await (supabase as any)
        .from(POSTS_TABLE_READ)
        .select(POST_TRADE_RELATION_SELECT)
        .in("id", productIds);
      if (Array.isArray(posts)) {
        posts.forEach((p: Record<string, unknown>) => {
          const id = String(p.id ?? "");
          if (id) postById.set(id, p);
        });
      }
    }

    const nicknameById = await batchNicknamesClient(supabase, userIds);
    return list.map((r) => mapTransactionReviewRowToAdminReview(r, postById.get(r.product_id), nicknameById));
  } catch {
    return [];
  }
}

/**
 * 클라이언트 직접 조회 폴백. 상세 화면은 `/api/admin/transaction-reviews` + reviewId 권장.
 */
export async function getAdminReviewByIdFromDb(reviewId: string): Promise<AdminReview | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: row, error } = await (supabase as any)
      .from("transaction_reviews")
      .select(SELECT_FIELDS)
      .eq("id", reviewId)
      .maybeSingle();

    if (error || !row) return null;
    const r = row as TransactionReviewDbRow;

    const { data: post } = await (supabase as any)
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_RELATION_SELECT)
      .eq("id", r.product_id)
      .maybeSingle();
    const postRow = (post as Record<string, unknown> | null) ?? undefined;
    const nicknameById = await batchNicknamesClient(supabase, [r.reviewer_id, r.reviewee_id]);
    return mapTransactionReviewRowToAdminReview(r, postRow, nicknameById);
  } catch {
    return null;
  }
}
