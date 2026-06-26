/**
 * V4 incoming visible-surface contract — Telegram Android parity.
 *
 * | App state              | Visible UI (exactly 1)              | Owner            |
 * |------------------------|-------------------------------------|------------------|
 * | Foreground unlocked    | Web top banner (`IncomingCallBanner`) | web_in_app       |
 * | Lock / sleep           | FSI Activity first; visible CallStyle fallback if FSI is denied or late | native_fsi -> notification_fallback |
 * | Background unlocked    | Activity-first; fallback notify if not shown in 2.5s | native_activity |
 *
 * FGS ringing notification is carrier-only (no second heads-up UI).
 * Lock path forbids manual startActivity loops. Background success = incoming_activity_shown.
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
  nonForeground: "native_activity_or_callstyle_fallback",
  fgsNotification: "carrier_only",
} as const;

export type CallV4TelegramIncomingSurfaceKind =
  (typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT)[keyof typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT];
