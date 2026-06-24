/**
 * V4 incoming visible-surface contract — Telegram Android parity.
 *
 * | App state              | Visible UI (exactly 1)              | Owner            |
 * |------------------------|-------------------------------------|------------------|
 * | Foreground unlocked    | Web top banner (`IncomingCallBanner`) | web_in_app       |
 * | Background / lock/sleep| Native fullscreen (`IncomingCallActivity`) | native_activity / native_fsi |
 *
 * FGS ringing notification is carrier-only (no CallStyle heads-up as a second UI).
 * CallStyle+FSI is fallback only when Activity launch fails.
 */

export const CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT = {
  foreground: "web_top_banner",
  nonForeground: "native_fullscreen_activity",
  fgsNotification: "carrier_only",
} as const;

export type CallV4TelegramIncomingSurfaceKind =
  (typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT)[keyof typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT];
