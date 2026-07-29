/**
 * V4 / Capacitor incoming visible-surface contract.
 *
 * Capacitor Android/iOS: Native Runtime / CallKit owns ringing UI.
 * Pure web/desktop V4 establishment: Web top banner remains the foreground surface.
 *
 * | App state (Capacitor)  | Visible UI (exactly 1)              | Owner            |
 * |------------------------|-------------------------------------|------------------|
 * | Any (native lanes on)  | Native Activity / FSI / CallKit     | native_activity / native_fsi |
 * | Lock / sleep           | FSI / CallKit first                 | native_fsi       |
 * | Background unlocked    | Activity or heads-up notification   | native_activity  |
 *
 * | App state (web/desktop V4) | Visible UI                     | Owner      |
 * |----------------------------|--------------------------------|------------|
 * | Foreground unlocked        | Web top banner                 | web_in_app |
 *
 * FGS ringing notification is carrier-only (no second heads-up UI).
 * WebView ringing banner/ringtone is forbidden while Native owns the session.
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
  /** Capacitor Android/iOS — Native Runtime / CallKit */
  capacitorNativeForeground: "native_incoming_surface",
  /** Pure web/desktop V4 establishment */
  webDesktopForeground: "web_top_banner",
  /**
   * @deprecated Prefer `webDesktopForeground` / `capacitorNativeForeground`.
   * Kept so legacy V4 desktop tests that read `.foreground` remain stable.
   */
  foreground: "web_top_banner",
  nonForeground: "native_activity_or_callstyle_fallback",
  fgsNotification: "carrier_only",
} as const;

export type CallV4TelegramIncomingSurfaceKind =
  (typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT)[keyof typeof CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT];
