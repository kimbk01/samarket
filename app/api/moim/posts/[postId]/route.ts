import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { getMoimPost, listMoimComments } from "@/lib/moim/server/moim-queries.server";
import { moimPostRemove, moimPostUpdate } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ postId: string }> };

/** 글 + 댓글 (볼 수 있는 경우만) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "post" });
  if (!g.ok) return g.response;
  const found = await getMoimPost(g.sb, postId, g.userId);
  if (!found) return moimNotFound();
  const comments = found.access.role ? await listMoimComments(g.sb, found.post, g.userId) : [];
  return NextResponse.json({ ok: true, post: found.post, comments, viewerIsMember: !!found.access.role });
}

/** 글 수정 (작성자) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "post_update", limit: 30 });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ title?: unknown; body?: unknown; images?: unknown; visibility?: unknown }>(req)) ?? {};
  const patch: Partial<{ title: string; body: string; images: string[]; visibility: "members" | "public" }> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.body === "string") patch.body = body.body;
  if (Array.isArray(body.images)) patch.images = body.images.filter((u): u is string => typeof u === "string");
  if (body.visibility === "public" || body.visibility === "members") patch.visibility = body.visibility;
  return moimRpcResponse(await moimPostUpdate(g.userId, postId, patch, g.sb));
}

/** 글 삭제(작성자) · 숨김(운영진) — body { reason? } */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "post_remove", limit: 30, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ reason?: unknown }>(req)) ?? {};
  return moimRpcResponse(await moimPostRemove(g.userId, postId, typeof body.reason === "string" ? body.reason : null, g.sb));
}
