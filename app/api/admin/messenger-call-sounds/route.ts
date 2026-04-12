import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
export const dynamic = "force-dynamic";

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb.from("admin_messenger_call_sound_settings").select("*").eq("id", "default").maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: data ?? null });
}

type PatchBody = Partial<{
  voice_incoming_enabled: boolean;
  voice_incoming_sound_url: string | null;
  voice_outgoing_ringback_enabled: boolean;
  voice_outgoing_ringback_url: string | null;
  video_incoming_enabled: boolean;
  video_incoming_sound_url: string | null;
  video_outgoing_ringback_enabled: boolean;
  video_outgoing_ringback_url: string | null;
  missed_notification_enabled: boolean;
  missed_notification_sound_url: string | null;
  call_end_enabled: boolean;
  call_end_sound_url: string | null;
  use_custom_sounds: boolean;
  default_fallback_sound_url: string | null;
}>;

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const keys = [
    "voice_incoming_enabled",
    "voice_incoming_sound_url",
    "voice_outgoing_ringback_enabled",
    "voice_outgoing_ringback_url",
    "video_incoming_enabled",
    "video_incoming_sound_url",
    "video_outgoing_ringback_enabled",
    "video_outgoing_ringback_url",
    "missed_notification_enabled",
    "missed_notification_sound_url",
    "call_end_enabled",
    "call_end_sound_url",
    "use_custom_sounds",
    "default_fallback_sound_url",
  ] as const;
  for (const k of keys) {
    if (k in body) {
      patch[k] = body[k];
    }
  }
  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const { data: existing, error: existErr } = await sb.from("admin_messenger_call_sound_settings").select("id").eq("id", "default").maybeSingle();
  if (existErr) {
    return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
  }

  if (existing) {
    const { error } = await sb.from("admin_messenger_call_sound_settings").update(patch).eq("id", "default");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const baseRow = {
    id: "default" as const,
    voice_incoming_enabled: true,
    voice_incoming_sound_url: null as string | null,
    voice_outgoing_ringback_enabled: true,
    voice_outgoing_ringback_url: null as string | null,
    video_incoming_enabled: true,
    video_incoming_sound_url: null as string | null,
    video_outgoing_ringback_enabled: true,
    video_outgoing_ringback_url: null as string | null,
    missed_notification_enabled: true,
    missed_notification_sound_url: null as string | null,
    call_end_enabled: true,
    call_end_sound_url: null as string | null,
    use_custom_sounds: true,
    default_fallback_sound_url: null as string | null,
  };
  const insertPayload = { ...baseRow, ...patch, id: "default" as const };
  const { error: insErr } = await sb.from("admin_messenger_call_sound_settings").insert(insertPayload);
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
