import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { callTradeAdminRpc, tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["active", "reserved", "sold", "hidden", "deleted"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveSoldBuyerId(
  sb: SupabaseClient,
  postId: string,
  before: { sold_buyer_id?: string | null; reserved_buyer_id?: string | null },
  requested: string | null
): Promise<{ buyerId: string | null; error?: string }> {
  if (requested) {
    if (!UUID_RE.test(requested)) {
      return { buyerId: null, error: "soldBuyerId는 UUID여야 합니다." };
    }
    return { buyerId: requested };
  }
  const existingSold =
    typeof before.sold_buyer_id === "string" && before.sold_buyer_id.trim()
      ? before.sold_buyer_id.trim()
      : "";
  if (existingSold) return { buyerId: existingSold };

  const reserved =
    typeof before.reserved_buyer_id === "string" && before.reserved_buyer_id.trim()
      ? before.reserved_buyer_id.trim()
      : "";
  if (reserved) return { buyerId: reserved };

  const { data: chats, error } = await sb
    .from("product_chats")
    .select("buyer_id")
    .eq("post_id", postId)
    .limit(50);
  if (error) return { buyerId: null, error: error.message };

  const ids = [
    ...new Set(
      (Array.isArray(chats) ? chats : [])
        .map((r: { buyer_id?: string | null }) =>
          typeof r.buyer_id === "string" ? r.buyer_id.trim() : ""
        )
        .filter(Boolean)
    ),
  ];
  if (ids.length === 1) return { buyerId: ids[0]! };
  if (ids.length === 0) {
    return {
      buyerId: null,
      error:
        "판매 확정 구매자가 없습니다. 거래 채팅 구매자를 지정하거나 reserved/sold buyer가 필요합니다.",
    };
  }
  return {
    buyerId: null,
    error: `구매자 후보가 ${ids.length}명입니다. soldBuyerId를 지정하세요.`,
  };
}

/**
 * POST /api/admin/posts/[postId]/status — 기존 호출 호환 (설계 v2 §F-1-1).
 * body: { status, reason?, soldBuyerId? }
 * - hidden / deleted → 관리자 노출 조치 (admin_trade_post_moderate: 상태 + 감사 한 트랜잭션, 사유 필수)
 * - active (관리자 숨김 글) → 숨김 해제. 판매 단계는 보존된 값으로 돌아온다.
 * - active / reserved / sold (노출 중 글) → 판매 단계 정정. sold 는 구매자 확인 필수 (L4).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;

  const { postId: rawId } = await params;
  const postId = typeof rawId === "string" ? rawId.trim() : "";
  if (!UUID_RE.test(postId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { status?: string; reason?: string | null; soldBuyerId?: string | null };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  const soldBuyerRequested =
    typeof body.soldBuyerId === "string" && body.soldBuyerId.trim() ? body.soldBuyerId.trim() : null;

  const { data: beforeRow, error: readErr } = await sb
    .from("posts")
    .select("id, status, title, sold_buyer_id, reserved_buyer_id, seller_listing_state, moderation_state, owner_state")
    .eq("id", postId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!beforeRow) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const before = beforeRow as Record<string, unknown>;

  const moderationAction =
    status === "hidden"
      ? "hide"
      : status === "deleted"
        ? "delete"
        : status === "active" && before.moderation_state === "admin_hidden"
          ? "unhide"
          : null;
  if (moderationAction) {
    if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    const res = await callTradeAdminRpc(sb, "admin_trade_post_moderate", {
      p_post_id: postId,
      p_actor_id: admin.userId,
      p_action: moderationAction,
      p_reason: reason,
      p_expected_updated_at: null,
      ...tradeAuditMetaArgs(req),
    });
    if (!res.ok) return res.response;
    return NextResponse.json({ ok: true, status: res.data.status ?? null, moderationState: res.data.moderation_state ?? null });
  }

  // 판매 단계 정정 (노출 상태는 건드리지 않는다)
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  let resolvedSoldBuyer: string | null = null;
  if (status === "active") {
    patch.seller_listing_state = "inquiry";
    patch.reserved_buyer_id = null;
  } else if (status === "reserved") {
    patch.seller_listing_state = "reserved";
  } else if (status === "sold") {
    const resolved = await resolveSoldBuyerId(
      sb,
      postId,
      before as { sold_buyer_id?: string | null; reserved_buyer_id?: string | null },
      soldBuyerRequested
    );
    if (!resolved.buyerId) {
      return NextResponse.json(
        { ok: false, error: resolved.error ?? "구매자를 선택하세요.", code: "need_sold_buyer" },
        { status: 400 }
      );
    }
    resolvedSoldBuyer = resolved.buyerId;
    patch.sold_buyer_id = resolvedSoldBuyer;
    patch.seller_listing_state = "completed";
    patch.reserved_buyer_id = null;
  }

  const { data: updated, error: writeErr } = await sb
    .from("posts")
    .update(patch)
    .eq("id", postId)
    .eq("seller_listing_state", String(before.seller_listing_state ?? ""))
    .select("id, status, seller_listing_state")
    .maybeSingle();
  if (writeErr) return NextResponse.json({ ok: false, error: writeErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "stale_state" }, { status: 409 });

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "trade_post",
    targetId: postId,
    action: `trade_post.sale_stage_${status}`,
    reason,
    before: {
      status: before.status ?? null,
      seller_listing_state: before.seller_listing_state ?? null,
      sold_buyer_id: before.sold_buyer_id ?? null,
    },
    after: {
      status: (updated as { status?: string }).status ?? null,
      seller_listing_state: (updated as { seller_listing_state?: string }).seller_listing_state ?? null,
      sold_buyer_id: resolvedSoldBuyer,
    },
  });

  return NextResponse.json({ ok: true, soldBuyerId: resolvedSoldBuyer, ...(audit.ok ? {} : { auditWarning: true }) });
}
