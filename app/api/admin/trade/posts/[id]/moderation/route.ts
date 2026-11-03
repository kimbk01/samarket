import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  callTradeAdminRpc,
  notifyTradePostOwnerAfterAdminAction,
  readJsonBody,
  tradeAuditMetaArgs,
} from "@/lib/admin/trade-admin/trade-admin-rpc";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { publishTradeListingVisibilityForModeration } from "@/lib/trade/listing-visibility/listing-visibility-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["hide", "unhide", "delete", "undelete"]);

/** D-6: 조치 뒤 상태 — 같은 조치를 다시 누르면 「먼저 변경됨」 대신 「이미 {상태}」로 안내 */
const TARGET_STATE: Record<string, string> = {
  hide: "admin_hidden",
  unhide: "visible",
  delete: "admin_deleted",
  undelete: "admin_hidden",
};

/**
 * POST /api/admin/trade/posts/[id]/moderation — 관리자 노출 조치 (설계 v2 §F-1-1 · §F-1-4)
 * body: { action: hide|unhide|delete|undelete, reason, expectedUpdatedAt? }
 * 판매 단계는 바꾸지 않는다. 관리자 숨김·삭제는 판매자가 해제할 수 없다 (판매자 API 는 owner_state 만 바꾼다).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const action = String(body.action ?? "");
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const res = await callTradeAdminRpc(admin.sb, "admin_trade_post_moderate", {
    p_post_id: id,
    p_actor_id: admin.userId,
    p_action: action,
    p_reason: reason,
    p_expected_updated_at: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    ...tradeAuditMetaArgs(req),
  });
  if (!res.ok) {
    if (res.response.status === 409) {
      const { data: cur } = await admin.sb.from("posts").select("moderation_state").eq("id", id).maybeSingle();
      const state = String((cur as { moderation_state?: unknown } | null)?.moderation_state ?? "");
      if (state && state === TARGET_STATE[action]) {
        return NextResponse.json({ ok: false, error: `already_${state}`, moderationState: state }, { status: 409 });
      }
    }
    return res.response;
  }
  /** 설계 §1-3: 공개 자격 변경 방송 (숨김·삭제 = 안 보임 · 해제 = 다시 보임 · 삭제 취소 = 관리자 숨김) */
  await publishTradeListingVisibilityForModeration(id, String(res.data.moderation_state ?? ""));
  const kind =
    action === "delete" ? "deleted" : action === "unhide" ? "restored" : action === "undelete" ? null : "hidden";
  const notified = kind
    ? await notifyTradePostOwnerAfterAdminAction(admin.sb, {
        postId: id,
        kind,
        reason,
        dedupeId: `${action}:${String(res.data.updated_at ?? Date.now())}`,
      })
    : true;
  return NextResponse.json({
    ok: true,
    ...(notified ? {} : { sideEffectWarning: true }),
    status: res.data.status ?? null,
    moderationState: res.data.moderation_state ?? null,
    updatedAt: res.data.updated_at ?? null,
  });
}
