/**
 * Web/PWA call tones — admin notification SSOT (/admin/settings/notifications).
 * Native Android RingOwner path is out of scope (HOLD).
 */
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { eventKeyForCallKind } from "@/lib/notifications/notification-sound-event-map";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";
import { ensureNotificationSoundSsotHydratedForClient } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

export type CallSsotSignalKind = "missed" | "call_end" | "rejected" | "cancelled";

export type CallSsotToneMode = "incoming" | "outgoing";

export function callSsotEventKeyForSignal(kind: CallSsotSignalKind): string {
  if (kind === "missed") return "call_missed";
  if (kind === "rejected") return "call_rejected";
  return "call_ended";
}

export function callSsotEventKeyForTone(
  mode: CallSsotToneMode,
  callKind: CommunityMessengerCallKind
): string {
  return eventKeyForCallKind(callKind === "video" ? "video" : "voice", mode);
}

export async function ensureCallNotificationSsotHydrated(): Promise<void> {
  await ensureNotificationSoundSsotHydratedForClient();
}

export async function resolveCallNotificationSsotWebUrl(eventKey: string): Promise<string | null> {
  await ensureCallNotificationSsotHydrated();
  const resolved = resolveNotificationSound(eventKey, { platform: "web" });
  if (!resolved.enabled || resolved.kind === "silent") return null;
  return resolved.webUrl ?? null;
}

export function resolveCallNotificationSsotWebUrlSync(eventKey: string): string | null {
  const resolved = resolveNotificationSound(eventKey, { platform: "web" });
  if (!resolved.enabled || resolved.kind === "silent") return null;
  return resolved.webUrl ?? null;
}

/** Foreground one-shot — same path as in-app notification SSOT (P1 hydrate). */
export async function playCallNotificationSsotSignal(kind: CallSsotSignalKind): Promise<void> {
  await playEventNotificationSound(callSsotEventKeyForSignal(kind));
}

export function callSsotSignalHasPlayableUrl(kind: CallSsotSignalKind): boolean {
  const url = resolveCallNotificationSsotWebUrlSync(callSsotEventKeyForSignal(kind));
  return Boolean(url);
}

export function callSsotToneHasPlayableUrl(
  mode: CallSsotToneMode,
  callKind: CommunityMessengerCallKind
): boolean {
  const url = resolveCallNotificationSsotWebUrlSync(callSsotEventKeyForTone(mode, callKind));
  return Boolean(url);
}
