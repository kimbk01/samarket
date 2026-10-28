/**
 * D-Q3 — 사용자 알림음·진동 끔을 일반 알림 푸시에 싣는다 (통화 푸시 제외).
 * resolver 계약상 playSound=false 이면 vibrate=false → 조합은 기본 · 진동 없음 · 무음 3가지.
 * - FCM data `soundMode` → Android 무음/무진동 채널 (`DibayNotificationChannelRegistry`)
 * - APNs `soundMode === "silent"` → `aps.sound` 생략
 */
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

export type PushSoundMode = "silent" | "no_vibrate";

export const PUSH_SOUND_MODE_META_KEY = "push_sound_mode";

export function resolvePushSoundMode(
  decision: Readonly<{ playSound: boolean; vibrate: boolean }> | null | undefined
): PushSoundMode | null {
  if (!decision) return null;
  if (!decision.playSound) return "silent";
  if (!decision.vibrate) return "no_vibrate";
  return null;
}

export function isPushSoundMode(value: unknown): value is PushSoundMode {
  return value === "silent" || value === "no_vibrate";
}

/** 게이트를 먼저 거친 호출(관리자 캠페인·관리자 업무 알림)이 meta 로 넘긴 값. */
export function pushSoundModeFromMeta(out: NotificationSideEffectPayloadOut): PushSoundMode | null {
  const meta = out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
  const mode = meta?.[PUSH_SOUND_MODE_META_KEY];
  return isPushSoundMode(mode) ? mode : null;
}

export function withPushSoundMode(
  out: NotificationSideEffectPayloadOut,
  mode: PushSoundMode | null
): NotificationSideEffectPayloadOut {
  if (!mode) return out;
  const meta = out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : {};
  return { ...out, meta: { ...meta, [PUSH_SOUND_MODE_META_KEY]: mode } };
}
