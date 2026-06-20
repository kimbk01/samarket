import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT } from "@/lib/admin/admin-public-settings-select";
import { mapMessengerCallSoundSettingsRow } from "@/lib/community-messenger/map-messenger-call-sound-settings-row";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      { ok: true, config: mapMessengerCallSoundSettingsRow(data as Record<string, unknown>) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
}
