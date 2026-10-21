import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { runMessengerStagingGc } from "@/lib/community-messenger/server/messenger-staging-gc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A-2 — 확정되지 않은 메신저 staged upload(`messenger-*-staging`) 중 24시간 지난 객체 정리. 일 1회.
 * staging 은 정의상 임시 객체(확정 시 항상 삭제)라 최종 미디어·다른 경로는 건드리지 않는다.
 * 인증: `CRON_SECRET` (다른 크론 라우트와 동일).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const result = await runMessengerStagingGc({ storage: sb.storage });
  console.info("[cron community-messenger-staging-gc]", {
    list_calls: result.list_calls,
    removed: result.removed,
    remove_failed: result.remove_failed,
    capped: result.capped,
    buckets: result.buckets.map((b) => ({
      bucket: b.bucket,
      skipped: b.skipped,
      users_total: b.users_total,
      users_scanned: b.users_scanned,
      stale: b.stale,
      removed: b.removed,
    })),
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
