/**
 * @deprecated 구현은 `lib/notifications/unified-messenger-trade-alert-contract.ts` 로 이전됨.
 * 하위 호환용 re-export 만 유지.
 */
export {
  UNIFIED_MESSAGE_ALERT_SOURCE,
  TRADE_CHAT_HUB_SNAPSHOT_BASED_SOUND_SUPPRESSED,
  UNIFIED_IN_APP_CHAT_SOUND_MIN_GAP_MS,
  tradeMarketChatUnreadForUi,
} from "@/lib/notifications/unified-messenger-trade-alert-contract";

/** 이전 이름 호환 — 허브 스냅샷 기반 거래 톤 억제와 동일 */
export { TRADE_CHAT_HUB_SNAPSHOT_BASED_SOUND_SUPPRESSED as TRADE_MARKET_CHAT_BADGE_AND_ALERT_SOUND_SUPPRESSED } from "@/lib/notifications/unified-messenger-trade-alert-contract";
