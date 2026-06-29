import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";
import { resolveNotificationSoundFromSnapshot } from "@/lib/notifications/notification-sound-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { event_keys?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const keys = Array.isArray(body.event_keys) ? body.event_keys.filter((k) => typeof k === "string") : [];
  if (keys.length === 0) {
    return NextResponse.json({ ok: false, error: "event_keys_required" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const snap = await loadNotificationSoundSsotFromDb(sb);
    const snapshot = {
      assets: new Map(snap.assets.map((a) => [a.id, a])),
      events: new Map(snap.events.map((e) => [e.event_key, e])),
      mappings: new Map(snap.mappings.map((m) => [m.event_key, m])),
    };
    const results = keys.map((eventKey) => ({
      event_key: eventKey,
      resolved: resolveNotificationSoundFromSnapshot(eventKey, { platform: "web" }, snapshot),
    }));
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
