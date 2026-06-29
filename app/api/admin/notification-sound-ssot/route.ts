import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";
import {
  mirrorNotificationSoundToLegacy,
  mappingPatchFromEventKey,
} from "@/lib/notifications/notification-sound-legacy-mirror";
import {
  NOTIFICATION_SOUND_ASSET_IDS,
  NOTIFICATION_SOUND_EVENT_KEYS,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";
import { invalidateNotificationSoundSsotCache } from "@/lib/notifications/notification-sound-resolver";
import {
  consumeConfirmToken,
  createConfirmToken,
  diffMappings,
} from "@/lib/notifications/notification-sound-ssot-admin-token";
import { invalidateNotificationSoundConfigCache } from "@/lib/notifications/notification-sound-engine";
import { invalidateMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MappingPatch = {
  event_key: string;
  asset_id: string;
  use_device_default?: boolean;
  volume?: number;
  repeat_count?: number;
  cooldown_seconds?: number;
  vibration_enabled?: boolean | null;
  priority?: string | null;
  enabled?: boolean;
};

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function validatePatch(p: MappingPatch): string | null {
  if (!p.event_key || !NOTIFICATION_SOUND_EVENT_KEYS.includes(p.event_key)) {
    return `unregistered event_key: ${p.event_key}`;
  }
  if (!p.asset_id || !NOTIFICATION_SOUND_ASSET_IDS.includes(p.asset_id)) {
    return `invalid asset_id: ${p.asset_id}`;
  }
  if (typeof p.volume === "number" && (p.volume < 0 || p.volume > 1)) return "invalid volume";
  if (typeof p.repeat_count === "number" && (p.repeat_count < 1 || p.repeat_count > 5)) {
    return "invalid repeat_count";
  }
  return null;
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  try {
    const data = await loadNotificationSoundSsotFromDb(sb);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { confirm_token?: string; mappings?: MappingPatch[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.confirm_token) {
    const patches = consumeConfirmToken(body.confirm_token);
    if (!patches) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_confirm_token" }, { status: 400 });
    }
    const mappings = patches as MappingPatch[];
    for (const p of mappings) {
      const err = validatePatch(p);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
      const { error } = await sb.from("notification_sound_mappings").upsert(
        {
          event_key: p.event_key,
          asset_id: p.asset_id,
          use_device_default: p.use_device_default === true,
          volume: typeof p.volume === "number" ? p.volume : 0.7,
          repeat_count: typeof p.repeat_count === "number" ? p.repeat_count : 1,
          cooldown_seconds: typeof p.cooldown_seconds === "number" ? p.cooldown_seconds : 0,
          vibration_enabled: p.vibration_enabled ?? null,
          priority: p.priority ?? null,
          enabled: p.enabled !== false,
          updated_by: admin.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_key" }
      );
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await mirrorNotificationSoundToLegacy(
      sb,
      mappings.map((p) => mappingPatchFromEventKey(p.event_key, p.asset_id, p))
    );
    invalidateNotificationSoundSsotCache();
    invalidateNotificationSoundConfigCache();
    invalidateMessengerCallSoundConfigCache();
    await loadNotificationSoundSsotFromDb(sb);
    return NextResponse.json({ ok: true, committed: mappings.length });
  }

  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (mappings.length === 0) {
    return NextResponse.json({ ok: false, error: "mappings_required" }, { status: 400 });
  }

  for (const p of mappings) {
    const err = validatePatch(p);
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const { data: current } = await sb.from("notification_sound_mappings").select("*");
  const diff = diffMappings((current ?? []) as Record<string, unknown>[], mappings as Record<string, unknown>[]);
  const confirm_token = createConfirmToken(mappings);
  return NextResponse.json({ ok: true, preview: true, diff, confirm_token });
}
