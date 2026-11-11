import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimCommentRemove } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ commentId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const commentId = requireUuid((await params).commentId);
  if (!commentId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "comment_remove", limit: 30, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimCommentRemove(g.userId, commentId, g.sb));
}
