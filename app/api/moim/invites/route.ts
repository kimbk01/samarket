import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead } from "@/lib/moim/server/moim-route-guard.server";
import { listReceivedMoimInvites } from "@/lib/moim/server/moim-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 받은 모임 초대 (대기 중) */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "invites_received", requireLogin: true });
  if (!g.ok) return g.response;
  return NextResponse.json({ ok: true, invites: await listReceivedMoimInvites(g.sb, g.userId!) });
}
