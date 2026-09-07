import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleActiveCommunityMessengerCallSessions } from "@/lib/community-messenger/call-session-heartbeat";
import { cleanupExpiredRingingCommunityMessengerCallSessions } from "@/lib/community-messenger/call-stale-ringing-cleanup";
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
  // CUT1: active both-stale → ended/heartbeat_timeout
  const active = await cleanupStaleActiveCommunityMessengerCallSessions();
  // CUT2: ringing past deadline → missed (separate authority from active presence)
  const ringing = await cleanupExpiredRingingCommunityMessengerCallSessions();
  return NextResponse.json({
    ok: true,
    ended: active.ended,
    missed: ringing.missed,
    ringTimeoutSeconds: ringing.ringTimeoutSeconds,
  });
}

/**
 * Scheduled terminal cleanup owner (Vercel cron).
 * - Active presence stale (CUT1)
 * - Ringing deadline → MISSED (CUT2)
 * Both mutate only via updateCommunityMessengerCallSession.
 */
export async function POST(req: NextRequest) {
  return runStaleCleanup(req);
}

export async function GET(req: NextRequest) {
  return runStaleCleanup(req);
}
