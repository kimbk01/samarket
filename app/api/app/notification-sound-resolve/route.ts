import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";
import { resolveNotificationSoundFromSnapshot } from "@/lib/notifications/notification-sound-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: { event_key?: string; room_id?: string; room_muted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventKey = typeof body.event_key === "string" ? body.event_key.trim() : "";
  if (!eventKey) {
    return NextResponse.json({ ok: false, error: "event_key_required" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const snap = await loadNotificationSoundSsotFromDb(sb);
    const snapshot = {
      assets: new Map(snap.assets.map((a) => [a.id, a])),
      events: new Map(snap.events.map((e) => [e.event_key, e])),
      mappings: new Map(snap.mappings.map((m) => [m.event_key, m])),
    };

    let userSoundEnabled = true;
    const userDomainEnabled = true;
    const { data: settings } = await sb
      .from("user_notification_settings")
      .select("sound_enabled, trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (settings) {
      userSoundEnabled = settings.sound_enabled !== false;
      // domain flags applied by caller context in adapters; default true here
      void settings.trade_chat_enabled;
      void settings.community_chat_enabled;
      void settings.order_enabled;
      void settings.store_enabled;
    }

    const resolved = resolveNotificationSoundFromSnapshot(
      eventKey,
      {
        roomId: body.room_id,
        userId: auth.userId,
        platform: "web",
        roomMuted: body.room_muted === true,
        userSoundEnabled,
        userDomainEnabled,
      },
      snapshot
    );

    return NextResponse.json({ ok: true, resolved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
