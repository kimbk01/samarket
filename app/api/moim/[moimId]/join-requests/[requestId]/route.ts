import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimJoinDecide } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; requestId: string }> };

/** P3 가입 승인·거절 — body { approve, reason } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const moimId = requireUuid(p.moimId);
  const requestId = requireUuid(p.requestId);
  if (!moimId || !requestId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join_decide", limit: 60, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ approve?: unknown; reason?: unknown }>(req);
  if (typeof body?.approve !== "boolean") return moimBadRequest();
  const result = await moimJoinDecide(g.userId, requestId, body.approve, typeof body.reason === "string" ? body.reason : null, g.sb);
  if (result.ok && result.moim_id === moimId) {
    await notifyMoimMany(g.sb, [result.user_id], {
      kind: body.approve ? "moim_join_approved" : "moim_join_rejected",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: requestId,
      vars: { moim: await loadMoimName(g.sb, moimId) },
    });
  }
  return moimRpcResponse(result);
}
