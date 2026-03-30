import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import {
  filterValidTagKeys,
  sanitizeReviewComment,
} from "@/lib/trade/trade-review-tags";
import { applyTrustScoreDelta } from "@/lib/trust/trust-score-apply";
import { reviewTrustBaseDelta } from "@/lib/trust/trust-score-core";
import type { PublicReviewType, ReviewRoleType } from "@/lib/types/daangn";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";

interface Body {
  revieweeId?: string;
  roleType?: ReviewRoleType;
  publicReviewType?: PublicReviewType;
  positiveTagKeys?: string[];
  negativeTagKeys?: string[];
  comment?: string;
  isAnonymousNegative?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const sb = getTradeServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const { roomId } = await params;
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const revieweeId = typeof body.revieweeId === "string" ? body.revieweeId.trim() : "";
  const roleType = body.roleType;
  const publicType = body.publicReviewType;
  if (!roomId?.trim() || !revieweeId || !roleType || !publicType) {
    return NextResponse.json({ ok: false, error: "필수 값이 없습니다." }, { status: 400 });
  }

  if (publicType !== "good" && publicType !== "normal" && publicType !== "bad") {
    return NextResponse.json({ ok: false, error: "평가 유형이 올바르지 않습니다." }, { status: 400 });
  }
  const access = await assertVerifiedMemberForAction(sb as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const resolved = await resolveProductChat(sb, roomId.trim());
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const pc = resolved.productChat;
  if (pc.buyer_id !== userId) {
    return NextResponse.json(
      { ok: false, error: "후기는 구매자만 작성할 수 있습니다." },
      { status: 403 }
    );
  }

  if (roleType !== "buyer_to_seller") {
    return NextResponse.json({ ok: false, error: "후기 유형이 올바르지 않습니다." }, { status: 400 });
  }

  if (revieweeId !== pc.seller_id) {
    return NextResponse.json({ ok: false, error: "후기 대상이 올바르지 않습니다." }, { status: 400 });
  }

  const flow = String(pc.trade_flow_status ?? "chatting");
  if (flow === "dispute") {
    return NextResponse.json(
      { ok: false, error: "분쟁 처리 중에는 후기를 남길 수 없습니다." },
      { status: 409 }
    );
  }

  if (
    flow !== "buyer_confirmed" &&
    flow !== "review_pending" &&
    flow !== "review_completed"
  ) {
    return NextResponse.json(
      { ok: false, error: "거래완료 확인 후에 평가·후기를 남길 수 있습니다." },
      { status: 409 }
    );
  }

  const sbAny = sb;
  const { data: post } = await sbAny
    .from("posts")
    .select("status")
    .eq("id", pc.post_id)
    .maybeSingle();
  if ((post as { status?: string } | null)?.status !== "sold") {
    return NextResponse.json({ ok: false, error: "거래완료된 상품만 후기를 남길 수 있습니다." }, { status: 409 });
  }

  const { data: existing } = await sbAny
    .from("transaction_reviews")
    .select("id")
    .eq("product_id", pc.post_id)
    .eq("reviewer_id", userId)
    .eq("reviewee_id", revieweeId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: false, error: "이미 후기를 남기셨습니다." }, { status: 409 });
  }

  const pos = filterValidTagKeys(body.positiveTagKeys, roleType);
  const neg = filterValidTagKeys(body.negativeTagKeys, roleType);
  const comment = sanitizeReviewComment(body.comment);
  const anon = !!body.isAnonymousNegative || publicType === "bad";

  const { error: insErr } = await sbAny.from("transaction_reviews").insert({
    product_id: pc.post_id,
    room_id: resolved.productChatId,
    reviewer_id: userId,
    reviewee_id: revieweeId,
    role_type: roleType,
    public_review_type: publicType,
    private_manner_score: null,
    private_tags: [],
    is_anonymous_negative: anon,
    positive_tag_keys: pos,
    negative_tag_keys: neg,
    review_comment: comment || null,
  });

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ ok: false, error: "이미 후기를 남기셨습니다." }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: insErr.message ?? "후기 저장 실패" },
      { status: 500 }
    );
  }

  const baseDelta = reviewTrustBaseDelta(publicType, pos.length);
  try {
    await applyTrustScoreDelta(sbAny, {
      userId: revieweeId,
      sourceType: "review",
      sourceId: resolved.productChatId,
      baseDelta,
      recentPositiveBoost: true,
      reason: `review:${roleType}:${publicType}`,
      metadata: {
        room_id: resolved.productChatId,
        reviewer_id: userId,
        positive: pos,
        negative: neg,
        public_review_type: publicType,
      },
    });
  } catch {
    /* trust_score / reputation_logs 미적용 DB */
  }

  /* 구매자 후기 1건으로 거래 후기 단계 완료 (판매자 후기 없음) */
  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "review_completed",
      chat_mode: "limited",
    })
    .eq("id", resolved.productChatId);

  return NextResponse.json({ ok: true, tradeFlowStatus: "review_completed" });
}
