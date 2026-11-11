import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listActiveMoimMemberIds, listMoimPosts, loadMoimAccess, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPostCreate } from "@/lib/moim/server/moim-rpc.server";
import { filterMoimRecipientsByPref, moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { isUuidString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 글 목록 — ?board=<id>&before=<iso>. 비멤버는 공개 글만 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "posts" });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const sp = req.nextUrl.searchParams;
  const board = sp.get("board");
  const page = await listMoimPosts(g.sb, access, g.userId, {
    boardId: board && isUuidString(board) ? board : null,
    before: sp.get("before"),
    limit: Number(sp.get("limit") ?? 20) || 20,
  });
  return NextResponse.json({ ok: true, ...page });
}

/** P9 글쓰기 — body { boardId, title?, body, images?, visibility? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "post_create", limit: 20 });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ boardId?: unknown; title?: unknown; body?: unknown; images?: unknown; visibility?: unknown }>(req);
  if (!body || typeof body.boardId !== "string" || typeof body.body !== "string") return moimBadRequest();
  const title = typeof body.title === "string" ? body.title : "";
  const result = await moimPostCreate(
    g.userId,
    moimId,
    {
      boardId: body.boardId,
      title,
      body: body.body,
      images: Array.isArray(body.images) ? body.images.filter((u): u is string => typeof u === "string") : [],
      visibility: body.visibility === "public" ? "public" : "members",
    },
    g.sb
  );
  if (result.ok) {
    /** 공지 → 「공지」 켠 멤버(기본 켜짐) · 그 외 글 → 「새 글」 켠 멤버(기본 꺼짐) — 모임별 알림 설정(설계 §7) */
    const isNotice = result.board_kind === "notice";
    const [members, moim] = await Promise.all([listActiveMoimMemberIds(g.sb, moimId), loadMoimName(g.sb, moimId)]);
    const recipients = await filterMoimRecipientsByPref(g.sb, moimId, members.filter((id) => id !== g.userId), isNotice ? "notice" : "posts");
    await notifyMoimMany(g.sb, recipients, {
      kind: isNotice ? "moim_notice_posted" : "moim_post_new",
      moimId,
      linkUrl: moimPaths.post(moimId, result.post_id),
      dedupeRef: result.post_id,
      vars: { moim, title: (title || body.body).slice(0, 60) },
    });
  }
  return moimRpcResponse(result);
}
