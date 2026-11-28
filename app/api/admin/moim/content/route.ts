/**
 * POST /api/admin/moim/content — 모임 콘텐츠 조치 (설계 moim §8 「게시글·일정·앨범」). 권한 키 `moim`.
 * body { type: "post"|"comment"|"album"|"schedule", id, action: "hide"|"restore"(숨김 해제)|"delete"|"undelete"(삭제 복구)|"cancel"(일정만), reason }
 * - 「삭제」·「삭제 복구」는 최고관리자만 (설계 §5.1 · §8).
 * - 일정 취소 → 확정 참여자에게 `moim_schedule_cancelled` (R2 N-08f).
 * - 글·댓글·사진 → 작성자에게 `moim_content_moderated` (§8 「당사자에게 알린다」 · R2 N-04).
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
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import type { MessageKey } from "@/lib/i18n/messages";

/** 작성자 알림의 콘텐츠 종류 문구 (R2 N-04) */
const CONTENT_TYPE_KEY: Record<"post" | "comment" | "album", MessageKey> = {
  post: "notify_moim_content_type_post",
  comment: "notify_moim_content_type_comment",
  album: "notify_moim_content_type_album",
};
const CONTENT_ACTION_VARIANT: Record<"hide" | "restore" | "delete" | "undelete", string> = {
  hide: "hidden",
  restore: "restored",
  delete: "deleted",
  undelete: "undeleted",
};

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
    const moimId = r.moim_id;
    const to = r.notify_user_ids ?? [];
    const title = r.title ?? "";
    notifyMoimAfterResponse(() =>
      notifyMoimMany(gate.sb, to, {
        kind: "moim_schedule_cancelled",
        moimId,
        linkUrl: moimPaths.schedule(moimId, id),
        dedupeRef: id,
        vars: { title },
      })
    );
  } else if (r.ok && type !== "schedule" && action !== "cancel" && r.moim_id && r.author_id) {
    const moimId = r.moim_id;
    const author = r.author_id;
    const name = r.name ?? "";
    const variant = CONTENT_ACTION_VARIANT[action];
    const ref = `${type}:${id}:${action}:${Date.now()}`;
    notifyMoimAfterResponse(() =>
      notifyMoimMany(gate.sb, [author], {
        kind: "moim_content_moderated",
        variant,
        moimId,
        linkUrl: type === "post" && (action === "restore" || action === "undelete") ? moimPaths.post(moimId, id) : moimPaths.home(moimId),
        dedupeRef: ref,
        vars: { moim: name },
        keyVars: { type: CONTENT_TYPE_KEY[type] },
      })
    );
  }
  return moimAdminRpcResponse(r);
}
