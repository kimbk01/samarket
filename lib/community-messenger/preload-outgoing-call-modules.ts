/**
 * Outgoing call module preload — remove await import from tap critical path.
 * Does not start calls or change authority.
 */
let preloadStarted = false;

export function preloadOutgoingCallLaunchModules(): void {
  if (typeof window === "undefined" || preloadStarted) return;
  preloadStarted = true;
  void import("@/lib/community-messenger/call-v4/call-v4-actions").catch(() => {
    /* best-effort */
  });
  void import("@/lib/platform/capacitor-native").catch(() => {
    /* best-effort */
  });
  void import("@/lib/call/native/native-outgoing-bridge").catch(() => {
    /* best-effort */
  });
  void import("@/lib/community-messenger/call-v3/call-v3-actions").catch(() => {
    /* best-effort */
  });
}
