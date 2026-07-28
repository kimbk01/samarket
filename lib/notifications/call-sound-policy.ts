/**
 * Call ringtone / ringback — normalized SSOT policy for Web · FCM · Android · iOS.
 * Authority: resolveNotificationSound (Admin Notification Sound SSOT).
 * DO NOT: treat URL-null as disabled; DO NOT: re-implement resolver per platform.
 */
import { eventKeyForCallKind } from "@/lib/notifications/notification-sound-event-map";
import {
  resolveNotificationSound,
  resolveNotificationSoundFromSnapshot,
  type NotificationSoundSsotSnapshot,
} from "@/lib/notifications/notification-sound-resolver";
import type {
  ResolveNotificationSoundContext,
  ResolvedNotificationSound,
} from "@/lib/notifications/notification-sound-types";

export const CALL_TONE_EVENT_KEYS = [
  "call_incoming_voice",
  "call_incoming_video",
  "call_outgoing_voice",
  "call_outgoing_video",
] as const;

export type CallToneEventKey = (typeof CALL_TONE_EVENT_KEYS)[number];

export const CALL_SIGNAL_EVENT_KEYS = ["call_missed", "call_ended", "call_rejected"] as const;

export type CallSignalEventKey = (typeof CALL_SIGNAL_EVENT_KEYS)[number];

export type CallSoundMode = "custom" | "default" | "silent";

export type ResolvedCallSoundPolicy = {
  eventKey: string;
  enabled: boolean;
  mode: CallSoundMode;
  webUrl: string | null;
  androidUrl: string | null;
  iosSoundName: string | null;
  updatedAt: string | null;
  assetId: string | null;
};

export type CallSoundToneKind = "voice" | "video";
export type CallSoundToneMode = "incoming" | "outgoing";

const TONE_KEY_SET = new Set<string>(CALL_TONE_EVENT_KEYS);

export function isCallToneEventKey(eventKey: string): eventKey is CallToneEventKey {
  return TONE_KEY_SET.has(eventKey.trim());
}

export function callToneEventKeyFor(
  kind: CallSoundToneKind,
  mode: CallSoundToneMode
): CallToneEventKey {
  return eventKeyForCallKind(kind, mode) as CallToneEventKey;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * iOS CallKit / APNs: registry uses literal "default" for system sound.
 * Only non-empty, non-"default" names count as custom bundle filenames.
 */
export function resolveIosCustomSoundName(iosSoundName: string | null | undefined): string | null {
  const name = trimOrNull(iosSoundName);
  if (!name) return null;
  if (name.toLowerCase() === "default") return null;
  return name;
}

function policyFromResolved(
  resolved: ResolvedNotificationSound,
  updatedAt: string | null
): ResolvedCallSoundPolicy {
  const eventKey = resolved.eventKey;
  if (!resolved.enabled || resolved.kind === "silent") {
    return {
      eventKey,
      enabled: false,
      mode: "silent",
      webUrl: null,
      androidUrl: null,
      iosSoundName: null,
      updatedAt,
      assetId: resolved.assetId ?? null,
    };
  }

  const webUrl = trimOrNull(resolved.webUrl);
  const iosCustom = resolveIosCustomSoundName(resolved.iosSoundName);
  const mode: CallSoundMode = webUrl || iosCustom ? "custom" : "default";

  return {
    eventKey,
    enabled: true,
    mode,
    webUrl,
    androidUrl: webUrl,
    iosSoundName: iosCustom,
    updatedAt,
    assetId: resolved.assetId ?? null,
  };
}

export function resolveCallSoundPolicy(
  eventKey: string,
  context: ResolveNotificationSoundContext = {},
  opts?: { updatedAt?: string | null; snapshot?: NotificationSoundSsotSnapshot }
): ResolvedCallSoundPolicy {
  const key = eventKey.trim();
  const resolved = opts?.snapshot
    ? resolveNotificationSoundFromSnapshot(key, context, opts.snapshot)
    : resolveNotificationSound(key, context);
  return policyFromResolved(resolved, opts?.updatedAt ?? null);
}

export function resolveCallToneSoundPolicy(
  kind: CallSoundToneKind,
  mode: CallSoundToneMode,
  context: ResolveNotificationSoundContext = {},
  opts?: { updatedAt?: string | null; snapshot?: NotificationSoundSsotSnapshot }
): ResolvedCallSoundPolicy {
  return resolveCallSoundPolicy(callToneEventKeyFor(kind, mode), context, opts);
}

/** Serialize for FCM / native config — no secrets; URLs may be public CDN. */
export function serializeCallSoundPolicyForNative(policy: ResolvedCallSoundPolicy): {
  event_key: string;
  enabled: boolean;
  mode: CallSoundMode;
  ringtone_policy: CallSoundMode;
  url: string | null;
  ios_sound_name: string | null;
  asset_id: string | null;
  updated_at: string | null;
} {
  return {
    event_key: policy.eventKey,
    enabled: policy.enabled,
    mode: policy.mode,
    ringtone_policy: policy.mode,
    url: policy.androidUrl ?? policy.webUrl,
    ios_sound_name: policy.iosSoundName,
    asset_id: policy.assetId,
    updated_at: policy.updatedAt,
  };
}
