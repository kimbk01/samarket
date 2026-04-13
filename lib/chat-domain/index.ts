export {
  inferMessengerDomainFromChatRoom,
  MESSENGER_DOMAIN_OWNERSHIP,
  MESSENGER_DOMAINS,
  MESSENGER_MONITORING_LABEL_DOMAIN,
  type MessengerDomain,
} from "./messenger-domains";

export {
  isSamarketChatPillarMessengerDomain,
  SAMARKET_CHAT_BOUNDARY_NOT_PILLARS,
  SAMARKET_CHAT_PILLAR_IDS,
  SAMARKET_CHAT_PILLARS,
  type SamarketChatPillarId,
} from "./samarket-three-chat-pillars";

export type {
  CommunityMessengerReadPort,
  CommunityMessengerRoomSnapshotOptions,
} from "./ports/community-messenger-read";

export { loadCommunityMessengerRoomBootstrap } from "./use-cases/community-messenger-bootstrap";

export { loadTradeChatRoomBootstrap } from "./use-cases/trade-chat-bootstrap";

export type {
  TradeChatBootstrapOptions,
  TradeChatReadPort,
} from "./ports/trade-chat-read";

export type {
  OrderChatReadPort,
  OrderChatSnapshotResult,
} from "./ports/order-chat-read";

export { loadOrderChatSnapshotForOrder } from "./use-cases/order-chat-snapshot";

export {
  CALL_SIGNALING_DOC,
  type CallSignalingStackKind,
} from "./ports/call-signaling-boundary";
