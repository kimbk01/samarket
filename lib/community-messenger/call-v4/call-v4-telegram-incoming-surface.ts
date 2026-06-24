/**
 * V4 incoming visible-surface contract — Telegram Android parity.
 *
 * | App state              | Visible UI (exactly 1)              | Owner            |
 * |------------------------|-------------------------------------|------------------|
 * | Foreground unlocked    | Web top banner (`IncomingCallBanner`) | web_in_app       |
 * | Background / lock/sleep| FGS → `IncomingCallActivity` primary; CallStyle+FSI fallback only | native_activity / native_fsi |
 *
 * FGS ringing notification is carrier-only (no second heads-up UI).
 * Full CallStyle+FSI posts only when Activity launch fails. actionOnly after Activity shown.
 */

export const CALL_V4_SURFACE_OWNER_KINDS = [
  "web_in_app",
  "native_activity",
  "native_fsi",
  "notification_fallback",
  "accepted_transition",
  "terminal",
  "unknown_pending",
] as const;

export const CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT = {
  foreground: "web_top_banner",
  nonForeground: "native_fullscreen_activity",
  fgsNotification: "carrier_only",
} as const;

export type CallV4TelegramIncomingSurfaceKind =
  (typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT)[keyof typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT];
