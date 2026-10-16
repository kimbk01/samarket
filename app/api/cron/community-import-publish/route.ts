import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { runDueJobs } from "@/lib/community-operator-import/jobs";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled community import publishing: continues bulk jobs the operator already approved
 * (spread/예약 jobs publish one item per due slot). It never creates jobs on its own.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (!verifyCronRequestAuthorization(req, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const jobs = await runDueJobs(getSupabaseServer(), { budgetMs: 45_000 });
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "publish_failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
