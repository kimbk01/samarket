import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  /** 빈 문자열이면 답글 삭제(null 저장) */
  reply?: string;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; reviewId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId, reviewId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const rid = typeof reviewId === "string" ? reviewId.trim() : "";
  if (!sid || !rid) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const replyRaw = String(body.reply ?? "");
  const reply = replyRaw.trim();
  const isDelete = reply === "";

  if (!isDelete && reply.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_reply" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: row, error: getErr } = await sb
    .from("store_reviews")
    .select("id, store_id, buyer_user_id, owner_reply_content")
    .eq("id", rid)
    .eq("store_id", sid)
    .maybeSingle();

  if (getErr || !row) {
    return NextResponse.json({ ok: false, error: "review_not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const isFirstReply = !row.owner_reply_content;

  const updatePayload: Record<string, unknown> = {
    owner_reply_content: isDelete ? null : reply,
    owner_reply_owner_user_id: isDelete ? null : userId,
  };

  if (isDelete) {
    // 삭제 시 날짜도 초기화
    updatePayload.owner_reply_created_at = null;
    updatePayload.owner_reply_updated_at = null;
  } else if (isFirstReply) {
    // 최초 작성: created_at 설정
    updatePayload.owner_reply_created_at = now;
    updatePayload.owner_reply_updated_at = null;
  } else {
    // 수정: updated_at만 갱신
    updatePayload.owner_reply_updated_at = now;
  }

  const { error: upErr } = await sb
    .from("store_reviews")
    .update(updatePayload)
    .eq("id", rid)
    .eq("store_id", sid);

  if (upErr) {
    // owner_reply_updated_at 컬럼 미적용 환경 대비 재시도
    if (upErr.message?.includes("owner_reply_updated_at")) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.owner_reply_updated_at;
      const { error: retryErr } = await sb
        .from("store_reviews")
        .update(fallbackPayload)
        .eq("id", rid)
        .eq("store_id", sid);
      if (retryErr) {
        return NextResponse.json({ ok: false, error: retryErr.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
  }

  // 최초 댓글 작성 시 리뷰 작성자에게 알림 (삭제·수정은 알림 없음)
  if (!isDelete && isFirstReply) {
    const buyerUserId = String((row as Record<string, unknown>).buyer_user_id ?? "").trim();
    if (buyerUserId) {
      void appendUserNotification(sb, {
        user_id: buyerUserId,
        notification_type: "review",
        title: "사장님이 리뷰에 댓글을 남겼어요",
        body: reply.length > 80 ? `${reply.slice(0, 79)}…` : reply,
        link_url: `/stores/owner/reviews`,
        domain: "store",
        ref_id: rid,
        sender_id: userId,
        meta: { store_id: sid, review_id: rid },
        push_kind: "delivery",
        dedupe_key: `owner_reply_${rid}`,
      });
    }
  }

  return NextResponse.json({ ok: true, deleted: isDelete });
}
