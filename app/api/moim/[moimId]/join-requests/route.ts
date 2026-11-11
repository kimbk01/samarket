import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimNotFound, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimJoinRequests, loadMoimAccess } from "@/lib/moim/server/moim-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "join_requests", requireLogin: true });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const requests = await listMoimJoinRequests(g.sb, access);
  if (!requests) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, requests });
}
