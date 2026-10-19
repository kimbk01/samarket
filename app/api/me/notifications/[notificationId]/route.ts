import { type NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchMemberInboxNotificationById } from "@/lib/notifications/inbox-events-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ notificationId: string }> };

/**
 * INAPP-03 — GET /api/me/notifications/:notificationId
 * Single Member Notification Center row (works past the first list page).
 * Missing / another member's / not list-eligible → 404 `not_found` (no ownership leak).
 * Read state is NOT changed here — detail page keeps the existing PATCH `{ ids }` read on open.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { notificationId: raw } = await ctx.params;
  const notificationId = String(raw ?? "").trim();
  if (!notificationId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await fetchMemberInboxNotificationById(sb, userId, notificationId);
  if (result.ok) {
    return NextResponse.json(
      { ok: true, notification: result.notification },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if (result.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  console.warn("[GET /api/me/notifications/:id]", result.message);
  return NextResponse.json({ ok: false, error: "load_failed" }, { status: 503 });
}
