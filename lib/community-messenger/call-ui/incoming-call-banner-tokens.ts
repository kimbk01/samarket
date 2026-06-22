/** Foreground compact incoming call banner — Android/iOS Web 동일 톤 (Starbucks 진녹). */
export const INCOMING_CALL_BANNER_BG_CLASS = "bg-[#006241]";
export const INCOMING_CALL_BANNER_BORDER_CLASS = "border-[#004F35]/40";
export const INCOMING_CALL_BANNER_ACCEPT_CLASS =
  "bg-[#22C55E] text-white shadow-[0_10px_22px_rgba(34,197,94,0.32)]";
export const INCOMING_CALL_BANNER_DECLINE_CLASS =
  "bg-[#EF1035] text-white shadow-[0_10px_22px_rgba(239,16,53,0.28)]";

export function triggerIncomingCallBannerHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
