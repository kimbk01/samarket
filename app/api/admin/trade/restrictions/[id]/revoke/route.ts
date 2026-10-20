import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { callTradeAdminRpc, readJsonBody, tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { notifyTradeSanction } from "@/lib/notifications/notify-trade-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/trade/restrictions/[id]/revoke — 거래 경고·제한 해제 (사유 필수, 해제 + 감사 한 트랜잭션) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = await readJsonBody(req);
  const reason = normalizeCommunityAdminReason(body?.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const res = await callTradeAdminRpc(admin.sb, "admin_revoke_trade_sanction", {
    p_sanction_id: id,
    p_actor_id: admin.userId,
    p_reason: reason,
    ...tradeAuditMetaArgs(req),
  });
  if (!res.ok) return res.response;

  let notifyWarning = false;
  const userId = String(res.data.user_id ?? "");
  if (userId) {
    try {
      await notifyTradeSanction(admin.sb, { userId, sanctionId: id, kind: "revoked", reason });
    } catch (e) {
      notifyWarning = true;
      console.error("[trade-restrictions] revoke notify", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true, id, user_id: userId, ...(notifyWarning ? { sideEffectWarning: true } : {}) });
}
