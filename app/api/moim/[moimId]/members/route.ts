import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimNotFound, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimBans, listMoimMembers, loadMoimAccess } from "@/lib/moim/server/moim-queries.server";
import { moimListCapped } from "@/lib/moim/moim-api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 멤버 목록 (멤버만) · ?view=banned 차단 목록 (차단 권한자만) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "members" });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  if (req.nextUrl.searchParams.get("view") === "banned") {
    const banned = await listMoimBans(g.sb, access);
    if (!banned) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true, banned, capped: moimListCapped(banned.length) });
  }
  /** R4 #6: 메모가 상한(500)에 닿으면 `notesCapped` (메모 권한자만 메모를 받는다) */
  const out: { notesCapped?: boolean } = {};
  const members = await listMoimMembers(g.sb, access, out);
  if (!members) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  return NextResponse.json({ ok: true, members, notesCapped: out.notesCapped === true });
}
