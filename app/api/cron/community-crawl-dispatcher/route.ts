import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import {
  COMMUNITY_CRAWL_SCHEDULER_FROZEN,
  COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
} from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Community Crawl Dispatcher — V2-0 FROZEN.
 * Architecture retained for V2-7; execution must not create SCHEDULED runs
 * until manual E2E (V2-6) passes and Owner unlocks scheduler.
 */
async function runDispatcher(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (COMMUNITY_CRAWL_SCHEDULER_FROZEN) {
    return NextResponse.json({
      ok: true,
      frozen: true,
      state: COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
      scanned: 0,
      results: [],
      runs_created: 0,
      item_mutations: 0,
      media_mutations: 0,
      detail: "Community crawl scheduler frozen until V2-6 manual E2E / V2-7 unlock",
    });
  }

  // Unreachable while COMMUNITY_CRAWL_SCHEDULER_FROZEN === true.
  // V2-7 restores due-board batch execution here.
  return NextResponse.json({
    ok: false,
    error: "scheduler_not_implemented",
    state: COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
  }, { status: 501 });
}

export async function GET(req: Request) {
  try {
    return await runDispatcher(req);
  } catch (err) {
    console.error("[cron community-crawl-dispatcher]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
