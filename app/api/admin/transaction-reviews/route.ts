import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { batchNicknamesByUserIds } from "@/lib/admin-reviews/batch-nicknames-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  mapTransactionReviewRowToAdminReview,
  type TransactionReviewDbRow,
} from "@/lib/admin-reviews/map-transaction-review-to-admin";

const SELECT_FIELDS =
  "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, private_manner_score, private_tags, is_anonymous_negative, created_at, positive_tag_keys, negative_tag_keys, review_comment";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }

  let body: { reviewId?: string };
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ review: null });
    }
    const r = row as TransactionReviewDbRow;
    const { data: post } = await sbAny.from("posts").select("*").eq("id", r.product_id).maybeSingle();
    const postRow = (post as Record<string, unknown> | null) ?? undefined;
    const nick = await batchNicknamesByUserIds(sbAny, [r.reviewer_id, r.reviewee_id]);
    const review = mapTransactionReviewRowToAdminReview(r, postRow, nick);
    return NextResponse.json({ review });
  }

  const { data: rows, error: listErr } = await sbAny
    .from("transaction_reviews")
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const list = (rows ?? []) as TransactionReviewDbRow[];
  const productIds = [...new Set(list.map((x) => x.product_id).filter(Boolean))];
  const userIds = [...new Set(list.flatMap((x) => [x.reviewer_id, x.reviewee_id]).filter(Boolean))];

  const postById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: posts } = await sbAny.from("posts").select("*").in("id", productIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (id) postById.set(id, p);
    });
    const missing = productIds.filter((id) => !postById.has(id));
    for (const mid of missing.slice(0, 40)) {
      const { data: one } = await sbAny.from("posts").select("*").eq("id", mid).maybeSingle();
      if (one) postById.set(String(mid), one as Record<string, unknown>);
    }
  }

  const nicknameById = await batchNicknamesByUserIds(sbAny, userIds);
  const reviews = list.map((r) =>
    mapTransactionReviewRowToAdminReview(r, postById.get(r.product_id), nicknameById)
  );

  return NextResponse.json({ reviews });
}
