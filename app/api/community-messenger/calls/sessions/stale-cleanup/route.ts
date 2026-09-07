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

/**
 * CUT1 Terminal Writer SSOT — sole scheduled path for heartbeat-stale terminal ends.
 * Presence: both-stale AND only → updateCommunityMessengerCallSession (not SQL UPDATE).
 */
export async function POST(req: NextRequest) {
  return runStaleCleanup(req);
}

/** Vercel Cron (GET) — registered in vercel.json after CUT1 (pg_cron no longer ends sessions) */
export async function GET(req: NextRequest) {
  return runStaleCleanup(req);
}
