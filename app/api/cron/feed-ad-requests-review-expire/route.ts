import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { notifyFeedAdMember } from "@/lib/ads/feed-ad-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회원 배너 신청 검토 7일 자동 반려 (광고 DB 묶음 B-DB · FB-12 · 2026-11-27).
 * 하루 1회(09:05 PHT). DB 함수 `system_expire_feed_ad_requests` 한 번 — 신청마다 보류 해제 + 반려 한 트랜잭션
 * (승인이 진행 중인 신청·확정 보류가 있는 신청은 건너뜀). 반려된 회원에게 알림.
 */
async function runFeedAdReviewExpire(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const { data, error } = await sb.rpc("system_expire_feed_ad_requests", { p_days: 7, p_limit: 100 });
    if (error) throw new Error(error.message);
    const out = (data ?? {}) as { ok?: boolean; error?: string; items?: { request_id?: string; user_id?: string; domain?: string }[] };
    if (out.ok !== true) throw new Error(out.error ?? "expire_failed");
    let notified = 0;
    for (const it of out.items ?? []) {
      const ok = await notifyFeedAdMember(sb, {
        userId: String(it.user_id ?? ""),
        requestId: String(it.request_id ?? ""),
        kind: "review_timeout",
        domain: it.domain ?? null,
      });
      if (ok) notified += 1;
    }
    return NextResponse.json({ ok: true, expired: (out.items ?? []).length, notified });
  } catch (err) {
    console.error("[cron feed-ad-requests-review-expire]", err);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runFeedAdReviewExpire(req);
}

export async function POST(req: Request) {
  return runFeedAdReviewExpire(req);
}
