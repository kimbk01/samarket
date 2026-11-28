import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteSend } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { MOIM_ROLE_KEY, moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { isMoimRole } from "@/lib/moim/moim-permission-contract";
import { isBlockedByOther } from "@/lib/community-messenger/social-relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P4 친구 직접 초대 — body { userId } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_send", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ userId?: unknown }>(req);
  const invitee = requireUuid(typeof body?.userId === "string" ? body.userId : null);
  if (!invitee) return moimBadRequest();
  /** 설계 P4 「메신저에서 나를 차단한 사람에게는 보낼 수 없다」 — 메신저 차단 단일 정의. 차단 사실은 드러내지 않는다 (감사 B4) */
  if (await isBlockedByOther(g.userId, invitee)) return moimRpcResponse({ ok: false, error: "moim_invite_not_allowed" });
  const result = await moimInviteSend(g.userId, moimId, invitee, g.sb);
  if (result.ok) {
    const inviteTargetId = result.invite_target_id;
    /** 발송은 응답 뒤 (W5 — 3번 E1 약속) · 시안 U9 「운영진 소희님이 초대했어요」 = 보낸 사람 역할 (R2 U9-03a) */
    notifyMoimAfterResponse(async () => {
      const { data: me } = await g.sb.from("moim_members").select("nickname, role").eq("moim_id", moimId).eq("user_id", g.userId).maybeSingle();
      const row = (me ?? null) as { nickname?: string; role?: unknown } | null;
      const role = isMoimRole(row?.role) ? row.role : "member";
      await notifyMoimMany(g.sb, [invitee], {
        kind: "moim_invited",
        moimId,
        linkUrl: moimPaths.invites(),
        dedupeRef: inviteTargetId,
        vars: { moim: await loadMoimName(g.sb, moimId), name: (row?.nickname ?? "").trim() },
        keyVars: { role: MOIM_ROLE_KEY[role] },
        actorId: g.userId,
      });
    });
  }
  return moimRpcResponse(result);
}
