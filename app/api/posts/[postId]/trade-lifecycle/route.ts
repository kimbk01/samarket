import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * POST /api/posts/[postId]/trade-lifecycle
 * Body: { action: "resume_active" | "cancel_trade" }
 * — 취소된 글 판매 재개 / 진행 중 거래 취소 (meta·단계 동기화)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { deriveTradeLifecycleStatus, type TradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";
import { insertPostTradeStatusLog } from "@/lib/trade/post-trade-status-log";

export const dynamic = "force-dynamic";

type Body = { action?: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (!id || (action !== "resume_active" && action !== "cancel_trade")) {
    return NextResponse.json({ ok: false, error: "postId, action(resume_active|cancel_trade) 필요" }, { status: 400 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;
  const access = await assertVerifiedMemberForAction(
    sbAny as import("@supabase/supabase-js").SupabaseClient,
    userId
  );
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  let { data: row, error: fetchErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id, status, seller_listing_state, meta")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr && /seller_listing_state/i.test(String(fetchErr.message))) {
    const r2 = await sbAny.from(POSTS_TABLE_READ).select("id, user_id, status, meta").eq("id", id).maybeSingle();
    row = r2.data ? ({ ...r2.data, seller_listing_state: null } as typeof row) : null;
    fetchErr = r2.error;
  }

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const owner = String((row as { user_id?: string }).user_id ?? "");
  if (!owner || owner !== userId) {
    return NextResponse.json({ ok: false, error: "판매자만 변경할 수 있습니다." }, { status: 403 });
  }

  const prevLifecycle = deriveTradeLifecycleStatus({
    status: (row as { status?: string }).status,
    seller_listing_state: (row as { seller_listing_state?: string | null }).seller_listing_state,
    meta: (row as { meta?: Record<string, unknown> | null }).meta,
  });

  const prevRow = row as Record<string, unknown>;
  const baseMeta =
    prevRow.meta && typeof prevRow.meta === "object" && prevRow.meta !== null
      ? ({ ...(prevRow.meta as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  let nextLifecycle: TradeLifecycleStatus;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (action === "resume_active") {
    if (prevLifecycle !== "cancelled") {
      return NextResponse.json(
        { ok: false, error: "취소된 글만 판매중으로 돌릴 수 있습니다." },
        { status: 403 }
      );
    }
    nextLifecycle = "active";
    baseMeta.trade_lifecycle_status = "active";
    baseMeta.trade_cancelled = false;
    patch.status = "active";
    patch.seller_listing_state = "inquiry";
    patch.reserved_buyer_id = null;
    patch.meta = baseMeta;
  } else {
    /* cancel_trade */
    if (prevLifecycle !== "in_progress") {
      return NextResponse.json(
        { ok: false, error: "거래 진행 중일 때만 거래 취소를 할 수 있습니다." },
        { status: 403 }
      );
    }
    nextLifecycle = "cancelled";
    baseMeta.trade_lifecycle_status = "cancelled";
    baseMeta.trade_cancelled = true;
    patch.status = "active";
    patch.seller_listing_state = "inquiry";
    patch.reserved_buyer_id = null;
    patch.meta = baseMeta;
  }

  let updErr = (await sbAny.from(POSTS_TABLE_WRITE).update(patch).eq("id", id)).error;
  if (
    updErr &&
    /reserved_buyer_id|column/i.test(String(updErr.message)) &&
    /does not exist|unknown/i.test(String(updErr.message))
  ) {
    const rest = { ...patch };
    delete rest.reserved_buyer_id;
    updErr = (await sbAny.from(POSTS_TABLE_WRITE).update(rest).eq("id", id)).error;
  }

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message ?? "저장 실패" }, { status: 500 });
  }

  await insertPostTradeStatusLog(sbAny, {
    postId: id,
    fromStatus: prevLifecycle,
    toStatus: nextLifecycle,
    userId,
    snapshot: { action, meta: baseMeta },
  });

  try {
    await sbAny
      .from("chat_rooms")
      .update({
        trade_status: action === "resume_active" ? "inquiry" : "inquiry",
        updated_at: now,
      })
      .eq("room_type", "item_trade")
      .eq("item_id", id);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, tradeLifecycleStatus: nextLifecycle });
}
