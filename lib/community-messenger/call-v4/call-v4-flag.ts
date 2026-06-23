/**
 * DIBAY Call V4 Telegram Lane — feature flag.
 * ON: native accept → CallScreenActivity; Web V4 screen only (no V3 replay).
 * Mutually exclusive with V3 Safe Lane.
 */
export function isCallV4TelegramLaneEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE === "1";
}
