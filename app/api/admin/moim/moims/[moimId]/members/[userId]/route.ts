/**
 * POST /api/admin/moim/moims/[moimId]/members/[userId] — 어드민 멤버 조치 (설계 moim §8 「멤버」). 권한 키 `moim`.
 * body { action: "role"|"remove"|"ban"|"unban"|"assign_host", role?: "co_host"|"staff"|"member", reason }
 * 알림: 역할 → `moim_role_changed`(대상) · 내보내기/차단(활성 멤버였을 때) → `moim_member_removed`(대상) ·
 *       가입 신청자 내보내기/차단 → `moim_join_rejected`(대상, R5 E10) ·
 *       모임장 지정 → `moim_host_changed`(전체 멤버, R5 E16 공용 함수) · 차단 해제 → `moim_unbanned`(대상, R2 N-04). 발송은 응답 뒤
 * 이동 위치(R5 E4): 대상은 더 이상 멤버가 아니므로 `moimNotifyLink(상태, 비멤버)` — 열 수 없는 모임이면 모임 탭.
 * 모임 상태(R5 D4·D11): 종료 모임 역할·모임장 지정 = 422 moim_closed · 삭제 모임 전부 = 422 moim_deleted (SQL 판정).
 */
import type { NextRequest } from "next/server";
import { isMoimRole } from "@/lib/moim/moim-permission-contract";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_MEMBER_ACTIONS, type MoimAdminMemberAction } from "@/lib/admin/moim/moim-admin-contract";
import { loadAdminMoimName } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import {
  moimAdminAssignHost,
  moimAdminMemberRemove,
  moimAdminMemberRole,
  moimAdminMemberUnban,
} from "@/lib/moim/server/moim-rpc.server";
import { MOIM_ROLE_KEY, moimNotifyLink, moimPaths, notifyMoimAfterResponse, notifyMoimHostChanged, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { moimViewStateFromRpc } from "@/lib/moim/moim-view-rule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; userId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const p = await params;
  const moimId = moimAdminUuid(p.moimId);
  const userId = moimAdminUuid(p.userId);
  if (!moimId || !userId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<{ action?: unknown; role?: unknown; reason?: unknown; expectedRole?: unknown; expectedHost?: unknown }>(req);
  const action = (MOIM_ADMIN_MEMBER_ACTIONS as readonly unknown[]).includes(body?.action) ? (body?.action as MoimAdminMemberAction) : null;
  if (!action) return moimAdminBad();
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const sb = gate.sb;
  const adminId = gate.actor.userId;

  if (action === "role") {
    const role = body?.role === "co_host" || body?.role === "staff" || body?.role === "member" ? body.role : null;
    if (!role) return moimAdminBad("moim_role_invalid");
    /** R1 A-17: 화면이 본 역할과 다르면 409 (다른 관리자가 먼저 바꿈) */
    const expectedRole = isMoimRole(body?.expectedRole) ? body.expectedRole : null;
    const r = await moimAdminMemberRole(adminId, moimId, userId, role, reason, sb, expectedRole);
    if (r.ok && r.changed) {
      const ref = `${moimId}:${role}:${Date.now()}`;
      notifyMoimAfterResponse(async () =>
        notifyMoimMany(sb, [userId], {
          kind: "moim_role_changed",
          moimId,
          linkUrl: moimPaths.home(moimId),
          dedupeRef: ref,
          vars: { moim: await loadAdminMoimName(sb, moimId) },
          keyVars: { role: MOIM_ROLE_KEY[role] },
        })
      );
    }
    return moimAdminRpcResponse(r);
  }
  if (action === "remove" || action === "ban") {
    const r = await moimAdminMemberRemove(adminId, moimId, userId, action === "ban", reason, sb);
    /** 활동 멤버 → 「내보내졌어요」 · 가입 신청자 → 「가입 신청이 거절됐어요」(R5 E10) · 그 밖(비멤버 차단) = 알림 없음 */
    const kind = r.ok ? (r.was_active ? "moim_member_removed" : r.was_pending ? "moim_join_rejected" : null) : null;
    if (r.ok && kind) {
      const ref = `${moimId}:${userId}:${Date.now()}`;
      const linkUrl = moimNotifyLink(moimViewStateFromRpc(r), false, moimPaths.home(moimId), { result: true }) ?? moimPaths.list();
      notifyMoimAfterResponse(async () =>
        notifyMoimMany(sb, [userId], {
          kind,
          moimId,
          linkUrl,
          dedupeRef: ref,
          vars: { moim: await loadAdminMoimName(sb, moimId) },
        })
      );
    }
    return moimAdminRpcResponse(r);
  }
  if (action === "unban") {
    const r = await moimAdminMemberUnban(adminId, moimId, userId, reason, sb);
    if (r.ok) {
      const ref = `${moimId}:${userId}:${Date.now()}`;
      const linkUrl = moimNotifyLink(moimViewStateFromRpc(r), false, moimPaths.home(moimId), { result: true }) ?? moimPaths.list();
      notifyMoimAfterResponse(async () =>
        notifyMoimMany(sb, [userId], {
          kind: "moim_unbanned",
          moimId,
          linkUrl,
          dedupeRef: ref,
          vars: { moim: await loadAdminMoimName(sb, moimId) },
        })
      );
    }
    return moimAdminRpcResponse(r);
  }
  const r = await moimAdminAssignHost(adminId, moimId, userId, reason, sb, moimAdminUuid(body?.expectedHost));
  if (r.ok) {
    const to = r.notify_user_ids ?? [];
    const ref = `${moimId}:${userId}:${Date.now()}`;
    notifyMoimAfterResponse(() => notifyMoimHostChanged(sb, moimId, userId, to, ref));
  }
  return moimAdminRpcResponse(r);
}
