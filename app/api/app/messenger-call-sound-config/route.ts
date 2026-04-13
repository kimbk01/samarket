import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT } from "@/lib/admin/admin-public-settings-select";

export const dynamic = "force-dynamic";

function mapRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    voice_incoming_enabled: row.voice_incoming_enabled !== false,
    voice_incoming_sound_url: (row.voice_incoming_sound_url as string | null) ?? null,
    voice_outgoing_ringback_enabled: row.voice_outgoing_ringback_enabled !== false,
    voice_outgoing_ringback_url: (row.voice_outgoing_ringback_url as string | null) ?? null,
    video_incoming_enabled: row.video_incoming_enabled !== false,
    video_incoming_sound_url: (row.video_incoming_sound_url as string | null) ?? null,
    video_outgoing_ringback_enabled: row.video_outgoing_ringback_enabled !== false,
    video_outgoing_ringback_url: (row.video_outgoing_ringback_url as string | null) ?? null,
    missed_notification_enabled: row.missed_notification_enabled !== false,
    missed_notification_sound_url: (row.missed_notification_sound_url as string | null) ?? null,
    call_end_enabled: row.call_end_enabled !== false,
    call_end_sound_url: (row.call_end_sound_url as string | null) ?? null,
    use_custom_sounds: row.use_custom_sounds !== false,
    default_fallback_sound_url: (row.default_fallback_sound_url as string | null) ?? null,
  };
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("admin_messenger_call_sound_settings")
      .select(ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT)
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      if (error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: true, config: null, table_missing: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { ok: true, config: mapRow(data as Record<string, unknown>) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
}
