/** 브라우저 `window` 에서 Supabase access_token 갱신 후 Realtime 채널을 재수립하기 위한 훅 이벤트. */
export const SAMARKET_REALTIME_TOKEN_REFRESH_EVENT = "samarket:supabase-realtime-token-refresh" as const;

export function dispatchSamarketRealtimeTokenRefreshed(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}
