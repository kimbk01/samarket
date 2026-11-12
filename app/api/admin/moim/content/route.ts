/**
 * POST /api/admin/moim/content — 모임 콘텐츠 조치 (설계 moim §8 「게시글·일정·앨범」). 권한 키 `moim`.
 * body { type: "post"|"comment"|"album"|"schedule", id, action: "hide"|"restore"(숨김 해제)|"delete"|"undelete"(삭제 복구)|"cancel"(일정만), reason }
 * - 「삭제」·「삭제 복구」는 최고관리자만 (설계 §5.1 · §8).
 * - 일정 취소 → 참여자(확정·신청)에게 `moim_schedule_cancelled`.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  MOIM_ADMIN_CONTENT_ACTIONS,
  MOIM_ADMIN_CONTENT_TYPES,
  type MoimAdminContentAction,
  type MoimAdminContentType,
} from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminContent } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const body = await moimAdminJson<{ type?: unknown; id?: unknown; action?: unknown; reason?: unknown }>(req);
  const type = (MOIM_ADMIN_CONTENT_TYPES as readonly unknown[]).includes(body?.type) ? (body?.type as MoimAdminContentType) : null;
  const action = (MOIM_ADMIN_CONTENT_ACTIONS as readonly unknown[]).includes(body?.action) ? (body?.action as MoimAdminContentAction) : null;
  const id = moimAdminUuid(body?.id);
  if (!type || !action || !id) return moimAdminBad();
  if ((type === "schedule") !== (action === "cancel")) return moimAdminBad("moim_content_action_invalid");
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");

  // 삭제·삭제 복구 = 최고관리자 (설계 §5.1 · §8) — 조치 자체로 판정
  if ((action === "delete" || action === "undelete") && !gate.actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: "super_admin_only" }, { status: 403 });
  }

  const r = await moimAdminContent(gate.actor.userId, type, id, action, reason, gate.sb);
  if (r.ok && type === "schedule" && r.moim_id) {
    await notifyMoimMany(gate.sb, r.notify_user_ids ?? [], {
      kind: "moim_schedule_cancelled",
      moimId: r.moim_id,
      linkUrl: moimPaths.schedule(r.moim_id, id),
      dedupeRef: id,
      vars: { title: r.title ?? "" },
    });
  }
  return moimAdminRpcResponse(r);
}
