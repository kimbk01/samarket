import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimNotFound } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteLinkResolve } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

/** 초대 링크 → 모임 id (조회만, 사용 횟수는 가입 시) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const token = ((await params).token ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "invite_resolve", limit: 60 });
  if (!g.ok) return g.response;
  const result = await moimInviteLinkResolve(token, g.sb);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, moimId: result.moim_id });
}
