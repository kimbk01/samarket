import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { cancelMyPostAd } from "@/lib/ads/mock-ad-data";
import { cancelPostAdForUserWithServiceRole } from "@/lib/ads/post-ads-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/post-ads/[adId]/cancel
 * 승인 전(draft / pending_payment / pending_review)만 취소.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { adId } = await params;
  if (!adId?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_ad_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (svc) {
    const r = await cancelPostAdForUserWithServiceRole(svc, auth.userId, adId.trim());
    if (r.ok) {
      return NextResponse.json({ ok: true, source: "supabase" });
    }
    if (r.error === "not_found") {
      /* DB에 해당 id 없음 → 인메모리 폴밄 */
    } else if (r.error === "not_cancellable") {
      return NextResponse.json({ ok: false, error: "not_cancellable" }, { status: 400 });
    } else if (r.error === "forbidden") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    } else {
      console.warn("[api/me/post-ads/cancel] service:", r.error);
      return NextResponse.json({ ok: false, error: r.error ?? "cancel_failed" }, { status: 500 });
    }
  }

  const mem = cancelMyPostAd(auth.userId, adId.trim());
  if (!mem.ok) {
    const status = mem.error === "not_cancellable" ? 400 : 404;
    return NextResponse.json({ ok: false, error: mem.error ?? "failed" }, { status });
  }
  return NextResponse.json({ ok: true, source: "memory" });
}
