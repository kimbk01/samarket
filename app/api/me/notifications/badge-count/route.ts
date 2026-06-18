import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chat: 0,
      group: 0,
      trade: 0,
      store: 0,
      missedCall: 0,
    });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("fresh") === "1";
  const counts = await fetchNotificationBadgeCount(sb, userId, { force });

  return NextResponse.json({
    ok: true,
    ...counts,
    missed_call: counts.missedCall,
  });
}
