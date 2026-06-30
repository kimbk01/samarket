import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * App client — read-only admin SSOT snapshot for in-app sound hydrate.
 * Foreground playback only; no per-user sound overrides in payload.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    const sb = getSupabaseServer();
    const data = await loadNotificationSoundSsotFromDb(sb);
    return NextResponse.json({
      ok: true,
      assets: data.assets,
      events: data.events,
      mappings: data.mappings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
