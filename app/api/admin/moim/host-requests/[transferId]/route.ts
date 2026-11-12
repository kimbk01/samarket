/**
 * POST /api/admin/moim/host-requests/[transferId] — 미접속 모임장 변경 요청 승인(지정)·거절. 권한 키 `moim`.
 * body { approve: boolean, reason }
 * 알림: 승인 → 전체 멤버 `moim_host_changed` · 요청자에게 결과 `moim_host_request_result`(approved|declined)
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminMoimName } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminHostRequestDecide } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ transferId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const transferId = moimAdminUuid((await params).transferId);
  if (!transferId) return moimAdminBad("moim_transfer_not_found", 404);
  const body = await moimAdminJson<{ approve?: unknown; reason?: unknown }>(req);
  if (typeof body?.approve !== "boolean") return moimAdminBad();
  const reason = moimAdminReason(body.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const r = await moimAdminHostRequestDecide(gate.actor.userId, transferId, body.approve, reason, gate.sb);
  if (r.ok && r.moim_id) {
    const moimId = r.moim_id;
    const name = await loadAdminMoimName(gate.sb, moimId);
    if (r.approved && r.to_user_id) {
      const { data: m } = await gate.sb.from("moim_members").select("nickname").eq("moim_id", moimId).eq("user_id", r.to_user_id).maybeSingle();
      await notifyMoimMany(gate.sb, r.notify_user_ids ?? [], {
        kind: "moim_host_changed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: transferId,
        vars: { moim: name, name: (m as { nickname?: string } | null)?.nickname ?? "" },
      });
    }
    if (r.requester_id) {
      await notifyMoimMany(gate.sb, [r.requester_id], {
        kind: "moim_host_request_result",
        variant: r.approved ? "approved" : "declined",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: transferId,
        vars: { moim: name },
      });
    }
  }
  return moimAdminRpcResponse(r);
}
