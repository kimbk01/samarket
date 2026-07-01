import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";
import {
  mirrorNotificationSoundToLegacy,
  mappingPatchFromEventKey,
} from "@/lib/notifications/notification-sound-legacy-mirror";
import { NOTIFICATION_SOUND_ASSET_IDS } from "@/lib/notifications/notification-sound-registry";
import { invalidateNotificationSoundSsotCache } from "@/lib/notifications/notification-sound-resolver";
import {
  type MappingPatch,
  validateMappingPatch,
} from "@/lib/notifications/notification-sound-ssot-admin-validation";
import { invalidateNotificationSoundConfigCache } from "@/lib/notifications/notification-sound-engine";
import { invalidateMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";
import type { NotificationSoundAssetRow } from "@/lib/notifications/notification-sound-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

async function loadValidationContext(sb: NonNullable<ReturnType<typeof sbOr503>>): Promise<{
  validAssetIds: Set<string>;
  assetsById: Map<string, NotificationSoundAssetRow>;
}> {
  const validAssetIds = new Set<string>(NOTIFICATION_SOUND_ASSET_IDS);
  const assetsById = new Map<string, NotificationSoundAssetRow>();

  const { data } = await sb
    .from("notification_sound_assets")
    .select("id, label, kind, domain, file_path, file_url, ios_sound_name, android_channel_base, legacy_source, enabled");

  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    validAssetIds.add(id);
    assetsById.set(id, row as NotificationSoundAssetRow);
  }

  return { validAssetIds, assetsById };
}

function mappingUpsertRow(p: MappingPatch, updatedBy: string) {
  return {
    event_key: p.event_key,
    asset_id: p.asset_id,
    use_device_default: p.use_device_default === true,
    volume: typeof p.volume === "number" ? p.volume : 0.7,
    repeat_count: typeof p.repeat_count === "number" ? p.repeat_count : 1,
    cooldown_seconds: typeof p.cooldown_seconds === "number" ? p.cooldown_seconds : 0,
    vibration_enabled: p.vibration_enabled ?? null,
    priority: p.priority ?? null,
    enabled: p.enabled !== false,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
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

  let body: { mappings?: MappingPatch[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (mappings.length === 0) {
    return NextResponse.json({ ok: false, error: "mappings_required" }, { status: 400 });
  }

  const { validAssetIds, assetsById } = await loadValidationContext(sb);
  const ctx = { validAssetIds, assetsById };

  for (const p of mappings) {
    const result = validateMappingPatch(p, ctx);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          ...(result.field ? { field: result.field } : {}),
          ...(result.max != null ? { max: result.max } : {}),
          ...(result.event_key ? { event_key: result.event_key } : {}),
        },
        { status: 400 }
      );
    }
  }

  for (const p of mappings) {
    const { error } = await sb
      .from("notification_sound_mappings")
      .upsert(mappingUpsertRow(p, admin.userId), { onConflict: "event_key" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  try {
    await mirrorNotificationSoundToLegacy(
      sb,
      mappings.map((p) => mappingPatchFromEventKey(p.event_key, p.asset_id, p))
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const eventKey = mappings.length === 1 ? mappings[0]?.event_key : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: msg.startsWith("legacy_mirror_failed:") ? "legacy_mirror_failed" : msg,
        ssot_committed: true,
        ...(eventKey ? { event_key: eventKey } : {}),
      },
      { status: 500 }
    );
  }

  invalidateNotificationSoundSsotCache();
  invalidateNotificationSoundConfigCache();
  invalidateMessengerCallSoundConfigCache();

  try {
    const data = await loadNotificationSoundSsotFromDb(sb);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, ssot_committed: true }, { status: 500 });
  }
}
