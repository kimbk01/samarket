import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { runExternalBoardAutoPublish } from "@/lib/external-board-import/auto/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler only — publishes via the same canonical publisher as MANUAL.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const sb = getSupabaseServer();
    const summary = await runExternalBoardAutoPublish(sb);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
