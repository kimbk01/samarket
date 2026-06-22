/** Compact incoming call banner — in-app Web / native pill 동일 구조 (iOS heads-up 참조). */
export const INCOMING_CALL_BANNER_BG_CLASS = "bg-[#3A3A3C]";
export const INCOMING_CALL_BANNER_BORDER_CLASS = "border-white/10";
export const INCOMING_CALL_BANNER_ACCEPT_CLASS =
  "bg-[#34C759] text-white shadow-[0_8px_18px_rgba(52,199,89,0.28)]";
export const INCOMING_CALL_BANNER_DECLINE_CLASS =
  "bg-[#FF3B30] text-white shadow-[0_8px_18px_rgba(255,59,48,0.28)]";

export function triggerIncomingCallBannerHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
