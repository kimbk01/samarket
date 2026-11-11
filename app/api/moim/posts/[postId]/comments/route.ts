import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimCommentCreate } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ postId: string }> };

/** 댓글 — body { body } (멤버만) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "comment_create", limit: 30, writeKind: "comment" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ body?: unknown }>(req);
  if (typeof body?.body !== "string") return moimBadRequest();
  const result = await moimCommentCreate(g.userId, postId, body.body, g.sb);
  if (result.ok && result.post_author_id && result.post_author_id !== g.userId) {
    await notifyMoimMany(g.sb, [result.post_author_id], {
      kind: "moim_comment",
      moimId: result.moim_id,
      linkUrl: moimPaths.post(result.moim_id, postId),
      dedupeRef: result.comment_id,
      vars: { moim: await loadMoimName(g.sb, result.moim_id) },
    });
  }
  return moimRpcResponse(result);
}
