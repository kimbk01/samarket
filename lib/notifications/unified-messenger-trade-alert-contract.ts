/**
 * 메신저 + 거래채팅 **통합 알림** — 허브 스냅샷·거래 탐색 표면 인앱 톤 억제·간격 상수.
 *
 * 최종 규정: **`samarket-messenger-notification-regulations.ts`** (`notif-0002`).
 *
 * @see lib/notifications/samarket-messenger-notification-regulations.ts
 * @see lib/community-messenger/notifications/messenger-notification-contract.ts
 */
export {
  SAMARKET_ALERT_SOURCE as UNIFIED_MESSAGE_ALERT_SOURCE,
  type SamarketAlertSource as UnifiedMessageAlertSource,
} from "@/lib/notifications/samarket-messenger-notification-regulations";

/**
 * `true`: 허브 스냅샷 증가만으로 `trade_chat` 도메인 톤을 내지 않음 (메신저 Realtime 경로와 이중 재생 방지).
 * 거래 탐색 표면 전체 무음은 `shouldSuppressMessengerInAppSoundOnTradeExplorationSurface` + `GlobalOrderChatUnreadSound` 가 담당.
 */
export const TRADE_CHAT_HUB_SNAPSHOT_BASED_SOUND_SUPPRESSED = true;

/** 인앱 채팅 계열 알림음 최소 간격(ms) — `notification-sound-engine` 도메인 dedupe 와 맞춤 */
export const UNIFIED_IN_APP_CHAT_SOUND_MIN_GAP_MS = 2000;

export function tradeMarketChatUnreadForUi(raw: number): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}
