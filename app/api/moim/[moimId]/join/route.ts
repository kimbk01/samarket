import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimJoin, moimJoinCancel } from "@/lib/moim/server/moim-rpc.server";
import { listMoimActorsFor, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P3 가입 (바로 가입 / 승인 신청). 링크로 들어왔으면 inviteToken */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join", limit: 10, phone: true });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ answers?: unknown; nickname?: unknown; avatarUrl?: unknown; bio?: unknown; inviteToken?: unknown }>(req)) ?? {};
  const result = await moimJoin(
    g.userId,
    moimId,
    {
      answers: Array.isArray(body.answers) ? body.answers.map((a) => (typeof a === "string" ? a.slice(0, 1000) : "")).slice(0, 3) : [],
      profile: {
        nickname: typeof body.nickname === "string" ? body.nickname : undefined,
        avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
        bio: typeof body.bio === "string" ? body.bio : undefined,
      },
      inviteToken: typeof body.inviteToken === "string" ? body.inviteToken : null,
    },
    g.sb
  );
  if (result.ok && result.status === "pending" && result.request_id) {
    const [deciders, moim] = await Promise.all([listMoimActorsFor(g.sb, moimId, "decide_join"), loadMoimName(g.sb, moimId)]);
    await notifyMoimMany(g.sb, deciders, {
      kind: "moim_join_requested",
      moimId,
      linkUrl: moimPaths.joinRequests(moimId),
      dedupeRef: result.request_id,
      vars: { moim, name: typeof body.nickname === "string" && body.nickname.trim() ? body.nickname.trim() : "" },
    });
  }
  return moimRpcResponse(result);
}

/** 가입 신청 취소 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join_cancel", limit: 10, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimJoinCancel(g.userId, moimId, g.sb));
}
