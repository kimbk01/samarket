import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteSend } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

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
  const result = await moimInviteSend(g.userId, moimId, invitee, g.sb);
  if (result.ok) {
    const { data: me } = await g.sb.from("moim_members").select("nickname").eq("moim_id", moimId).eq("user_id", g.userId).maybeSingle();
    await notifyMoimMany(g.sb, [invitee], {
      kind: "moim_invited",
      moimId,
      linkUrl: moimPaths.invites(),
      dedupeRef: result.invite_target_id,
      vars: { moim: await loadMoimName(g.sb, moimId), name: ((me as { nickname?: string } | null)?.nickname ?? "").trim() },
    });
  }
  return moimRpcResponse(result);
}
