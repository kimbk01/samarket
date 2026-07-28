import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT } from "@/lib/admin/admin-public-settings-select";
import {
  CALL_TONE_EVENT_KEYS,
  resolveCallSoundPolicy,
  serializeCallSoundPolicyForNative,
  type ResolvedCallSoundPolicy,
} from "@/lib/notifications/call-sound-policy";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function policyEnabledUrl(policy: ResolvedCallSoundPolicy): {
  enabled: boolean;
  url: string | null;
  mode: ResolvedCallSoundPolicy["mode"];
} {
  return {
    enabled: policy.enabled,
    url: policy.mode === "custom" ? policy.androidUrl ?? policy.webUrl : null,
    mode: policy.mode,
  };
}

function mapLegacyPolicyRow(
  policies: Record<string, ReturnType<typeof serializeCallSoundPolicyForNative>>,
  legacy: Record<string, unknown> | null
) {
  const voiceIn = policies.call_incoming_voice;
  const voiceOut = policies.call_outgoing_voice;
  const videoIn = policies.call_incoming_video;
  const videoOut = policies.call_outgoing_video;
  const missed = policies.call_missed;
  const ended = policies.call_ended;

  const t = Number(legacy?.incoming_ring_timeout_seconds);
  const vol = Number(legacy?.incoming_ringtone_volume);
  const cooldown = Number(legacy?.repeated_call_cooldown_seconds);

  return {
    voice_incoming_enabled: voiceIn?.enabled !== false,
    voice_incoming_sound_url: voiceIn?.url ?? null,
    voice_incoming_mode: voiceIn?.mode ?? "default",
    voice_outgoing_ringback_enabled: voiceOut?.enabled !== false,
    voice_outgoing_ringback_url: voiceOut?.url ?? null,
    voice_outgoing_mode: voiceOut?.mode ?? "default",
    video_incoming_enabled: videoIn?.enabled !== false,
    video_incoming_sound_url: videoIn?.url ?? null,
    video_incoming_mode: videoIn?.mode ?? "default",
    video_outgoing_ringback_enabled: videoOut?.enabled !== false,
    video_outgoing_ringback_url: videoOut?.url ?? null,
    video_outgoing_mode: videoOut?.mode ?? "default",
    missed_notification_enabled: missed?.enabled !== false,
    missed_notification_sound_url: missed?.url ?? null,
    call_end_enabled: ended?.enabled !== false,
    call_end_sound_url: ended?.url ?? null,
    use_custom_sounds: true,
    default_fallback_sound_url: (legacy?.default_fallback_sound_url as string | null) ?? null,
    incoming_ring_timeout_seconds: Number.isFinite(t)
      ? Math.min(600, Math.max(10, Math.round(t)))
      : DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
    incoming_ringtone_volume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.72,
    busy_auto_reject_enabled: legacy?.busy_auto_reject_enabled === true,
    repeated_call_cooldown_seconds: Number.isFinite(cooldown)
      ? Math.min(3600, Math.max(0, Math.floor(cooldown)))
      : 0,
    suppress_incoming_local_notifications: legacy?.suppress_incoming_local_notifications === true,
    /** SSOT-derived policies — native Android/iOS should prefer these */
    policies,
    ssot_authority: true as const,
    updated_at: (legacy?.updated_at as string | null) ?? null,
  };
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    const sb = getSupabaseServer();
    await loadNotificationSoundSsotFromDb(sb);

    const updatedAtCandidates: string[] = [];
    const policies: Record<string, ReturnType<typeof serializeCallSoundPolicyForNative>> = {};
    for (const key of [
      ...CALL_TONE_EVENT_KEYS,
      "call_missed",
      "call_ended",
      "call_rejected",
    ] as const) {
      const policy = resolveCallSoundPolicy(key, { platform: "android" });
      policies[key] = serializeCallSoundPolicyForNative(policy);
      void policyEnabledUrl(policy);
    }

    const { data, error } = await sb
      .from("admin_messenger_call_sound_settings")
      .select(ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT)
      .eq("id", "default")
      .maybeSingle();

    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const legacy = (data as Record<string, unknown> | null) ?? null;
    if (legacy?.updated_at && typeof legacy.updated_at === "string") {
      updatedAtCandidates.push(legacy.updated_at);
    }
    const updatedAt = updatedAtCandidates[0] ?? null;
    for (const key of Object.keys(policies)) {
      policies[key] = { ...policies[key], updated_at: policies[key].updated_at ?? updatedAt };
    }

    return NextResponse.json(
      {
        ok: true,
        config: mapLegacyPolicyRow(policies, legacy),
        table_missing: Boolean(error?.message?.includes("does not exist")),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
}
