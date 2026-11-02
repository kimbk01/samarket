import { NextRequest, NextResponse } from "next/server";
import { markCampaignPushOpenedByOccurrence } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isCampaignOccurrenceId } from "@/lib/notifications/campaign-push-open-param";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST `{ occurrence_id }` — 푸시 전용 알림을 열었다(push-only-open-tracking-design-2026-11-02 · Owner 승인).
 * 본인(로그인 회원)의 그 회차 푸시 기록만 열람으로 바꾼다. 남의 회차 id 로는 바뀌지 않고, 다시 불러도 같다.
 */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { occurrence_id?: unknown };
  const occurrenceId = typeof body.occurrence_id === "string" ? body.occurrence_id.trim() : "";
  if (!isCampaignOccurrenceId(occurrenceId)) {
    return NextResponse.json({ ok: false, error: "invalid_occurrence_id" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  try {
    const updated = await markCampaignPushOpenedByOccurrence(sb, occurrenceId, userId);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error("[me/notifications/campaign-push-opened]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
