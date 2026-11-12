/**
 * POST /api/admin/moim/moims/[moimId]/members/[userId] — 어드민 멤버 조치 (설계 moim §8 「멤버」). 권한 키 `moim`.
 * body { action: "role"|"remove"|"ban"|"unban"|"assign_host", role?: "co_host"|"staff"|"member", reason }
 * 알림: 역할 → `moim_role_changed`(대상) · 내보내기/차단(활성 멤버였을 때) → `moim_member_removed`(대상) ·
 *       모임장 지정 → `moim_host_changed`(전체 멤버)
 */
import type { NextRequest } from "next/server";
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
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

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
  const body = await moimAdminJson<{ action?: unknown; role?: unknown; reason?: unknown }>(req);
  const action = (MOIM_ADMIN_MEMBER_ACTIONS as readonly unknown[]).includes(body?.action) ? (body?.action as MoimAdminMemberAction) : null;
  if (!action) return moimAdminBad();
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const sb = gate.sb;
  const adminId = gate.actor.userId;

  if (action === "role") {
    const role = body?.role === "co_host" || body?.role === "staff" || body?.role === "member" ? body.role : null;
    if (!role) return moimAdminBad("moim_role_invalid");
    const r = await moimAdminMemberRole(adminId, moimId, userId, role, reason, sb);
    if (r.ok && r.changed) {
      await notifyMoimMany(sb, [userId], {
        kind: "moim_role_changed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: `${moimId}:${role}:${Date.now()}`,
        vars: { moim: await loadAdminMoimName(sb, moimId) },
        roleVar: role,
      });
    }
    return moimAdminRpcResponse(r);
  }
  if (action === "remove" || action === "ban") {
    const r = await moimAdminMemberRemove(adminId, moimId, userId, action === "ban", reason, sb);
    if (r.ok && r.was_active) {
      await notifyMoimMany(sb, [userId], {
        kind: "moim_member_removed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: `${moimId}:${Date.now()}`,
        vars: { moim: await loadAdminMoimName(sb, moimId) },
      });
    }
    return moimAdminRpcResponse(r);
  }
  if (action === "unban") {
    return moimAdminRpcResponse(await moimAdminMemberUnban(adminId, moimId, userId, reason, sb));
  }
  const r = await moimAdminAssignHost(adminId, moimId, userId, reason, sb);
  if (r.ok) {
    const name = await loadAdminMoimName(sb, moimId);
    const { data: m } = await sb.from("moim_members").select("nickname").eq("moim_id", moimId).eq("user_id", userId).maybeSingle();
    await notifyMoimMany(sb, r.notify_user_ids ?? [], {
      kind: "moim_host_changed",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: `${moimId}:${userId}:${Date.now()}`,
      vars: { moim: name, name: (m as { nickname?: string } | null)?.nickname ?? "" },
    });
  }
  return moimAdminRpcResponse(r);
}
