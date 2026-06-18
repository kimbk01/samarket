import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleActiveCommunityMessengerCallSessions } from "@/lib/community-messenger/call-session-heartbeat";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runStaleCleanup(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await cleanupStaleActiveCommunityMessengerCallSessions();
  return NextResponse.json({ ok: true, ...result });
}

/** Service/cron — one-sided stale active call cleanup + peer notify (TS path) */
export async function POST(req: NextRequest) {
  return runStaleCleanup(req);
}

/** Vercel Cron (GET) — enable via vercel.json when pg_cron is not the stale cleanup owner */
export async function GET(req: NextRequest) {
  return runStaleCleanup(req);
}
