import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { loadMoimAccess } from "@/lib/moim/server/moim-queries.server";
import { listMoimAlbum } from "@/lib/moim/server/moim-schedule-queries.server";
import { moimAlbumAdd } from "@/lib/moim/server/moim-rpc.server";
import { isUuidString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 앨범 (멤버만) — ?before=&pinned=1&schedule= */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "album", requireLogin: true });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const sp = req.nextUrl.searchParams;
  const schedule = sp.get("schedule");
  const page = await listMoimAlbum(g.sb, access, g.userId, {
    before: sp.get("before"),
    pinnedOnly: sp.get("pinned") === "1",
    scheduleId: schedule && isUuidString(schedule) ? schedule : null,
  });
  if (!page) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  return NextResponse.json({ ok: true, ...page });
}

/** 사진 올리기 — body { urls: string[] (≤10), scheduleId? } (업로드는 기존 커뮤니티 사진 업로드로 먼저) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "album_add", limit: 20 });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ urls?: unknown; scheduleId?: unknown }>(req);
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];
  if (!urls.length) return moimBadRequest();
  const scheduleId = requireUuid(typeof body?.scheduleId === "string" ? body.scheduleId : null);
  return moimRpcResponse(await moimAlbumAdd(g.userId, moimId, urls, scheduleId, g.sb));
}
