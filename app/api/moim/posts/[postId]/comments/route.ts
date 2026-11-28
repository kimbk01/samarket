import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimCommentCreate } from "@/lib/moim/server/moim-rpc.server";
import { getMoimPost, listMoimComments, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ postId: string }> };

/**
 * 이전 댓글 쪽 (R4 #4·5) — ?before=(글 상세 `commentsBefore` 또는 앞 쪽 `nextBefore`). 멤버만(글 상세와 같은 규칙).
 * 「이전 댓글 더 보기」를 누를 때만 부른다 — 글 상세 첫 진입 요청 수는 그대로.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "post" });
  if (!g.ok) return g.response;
  const found = await getMoimPost(g.sb, postId, g.userId);
  if (!found) return moimNotFound();
  if (!found.access.role) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  const page = await listMoimComments(g.sb, found.post, g.userId, { before: req.nextUrl.searchParams.get("before") });
  return NextResponse.json({ ok: true, items: page.items, nextBefore: page.nextBefore });
}

/** 댓글 — body { body } (멤버만) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "comment_create", limit: 30, writeKind: "comment" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ body?: unknown }>(req);
  if (typeof body?.body !== "string") return moimBadRequest();
  const result = await moimCommentCreate(g.userId, postId, body.body, g.sb);
  /** R2 N-02: 글쓴이가 지금 활동 멤버일 때만 DB 가 id 를 준다 · 행위자 = 댓글 쓴 사람(N-08a) · 응답 뒤(R-e) */
  if (result.ok && result.post_author_id && result.post_author_id !== g.userId) {
    const author = result.post_author_id;
    const moimId = result.moim_id;
    const commentId = result.comment_id;
    notifyMoimAfterResponse(async () =>
      notifyMoimMany(g.sb, [author], {
        kind: "moim_comment",
        moimId,
        linkUrl: moimPaths.post(moimId, postId),
        dedupeRef: commentId,
        vars: { moim: await loadMoimName(g.sb, moimId) },
        actorId: g.userId,
      })
    );
  }
  return moimRpcResponse(result);
}
