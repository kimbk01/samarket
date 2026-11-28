/**
 * POST /api/admin/moim/moims/[moimId]/lifecycle — 모임 삭제·복구 (설계 moim §6 P15 · §8). **최고관리자만**.
 * body { action: "delete"|"restore", reason } — 소프트 삭제(상태값만), 방은 보관(읽기 전용). 복구 = 종료 기록이 있으면 종료 상태로.
 */
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminDelete, moimAdminRestore } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimClosedOrDeleted, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<{ action?: unknown; reason?: unknown }>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  /** §8 「당사자에게 알린다」 (R2 N-04) — 삭제: 멤버 전원 + 취소된 일정 확정자 · 복구: 멤버 전원. 발송은 응답 뒤 */
  if (body?.action === "delete") {
    const r = await moimAdminDelete(gate.actor.userId, moimId, reason, gate.sb);
    if (r.ok) notifyMoimAfterResponse(() => notifyMoimClosedOrDeleted(gate.sb, moimId, r, { kind: "admin_deleted" }));
    return moimAdminRpcResponse(r);
  }
  if (body?.action === "restore") {
    const r = await moimAdminRestore(gate.actor.userId, moimId, reason, gate.sb);
    if (r.ok) {
      const to = r.notify_user_ids ?? [];
      const ref = `${moimId}:${Date.now()}`;
      notifyMoimAfterResponse(() =>
        notifyMoimMany(gate.sb, to, {
          kind: "moim_restored",
          /** 종료 기록이 있으면 종료 상태로 복구된다 — 「다시 열렸어요」가 아니라 「기록을 다시 볼 수 있어요」 (재감사 F3) */
          ...(r.status === "closed" ? { variant: "closed" } : {}),
          moimId,
          linkUrl: moimPaths.home(moimId),
          dedupeRef: ref,
          vars: { moim: r.name ?? "" },
        })
      );
    }
    return moimAdminRpcResponse(r);
  }
  return moimAdminBad();
}
