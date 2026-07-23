/**
 * Phase 1 — Legacy 경로 분류 카탈로그.
 * 신규 `lib/messenger/**` 는 QUARANTINE / REPLACE 경로를 직접 import 하면 안 된다.
 */
export type LegacyPathStatus =
  | "KEEP_CORE"
  | "REPLACE"
  | "QUARANTINE"
  | "DELETE_AFTER_CUTOVER";

export type LegacyCatalogEntry = Readonly<{
  /** `@/` 없이 repo-relative, 또는 import path prefix */
  path: string;
  status: LegacyPathStatus;
  note: string;
}>;

/**
 * 신규 Domain module 에서 금지할 import (REPLACE | QUARANTINE | DELETE_AFTER_CUTOVER).
 * KEEP_CORE 는 허용(메시지 코어·Port·identity).
 */
export const MESSENGER_LEGACY_CATALOG: ReadonlyArray<LegacyCatalogEntry> = [
  // —— REPLACE: 통합 bootstrap / 홈 authoritative ——
  {
    path: "lib/community-messenger/home/use-community-messenger-home-bootstrap",
    status: "REPLACE",
    note: "단일 setData bootstrap SSOT",
  },
  {
    path: "lib/community-messenger/bootstrap-cache",
    status: "REPLACE",
    note: "peek flatMap 재합체",
  },
  {
    path: "lib/community-messenger/cm-bootstrap-client-fetch",
    status: "REPLACE",
    note: "통합 bootstrap client fetch",
  },
  {
    path: "lib/community-messenger/cm-home-silent-lists-fetch",
    status: "REPLACE",
    note: "통합 home-sync client",
  },
  {
    path: "lib/community-messenger/use-community-messenger-home-state",
    status: "REPLACE",
    note: "unifiedRooms + pillar filter",
  },
  {
    path: "lib/community-messenger/get-community-messenger-home-sync-bundle",
    status: "REPLACE",
    note: "통합 home-sync bundle",
  },
  {
    path: "lib/community-messenger/full-bootstrap-snapshot-assemble",
    status: "REPLACE",
    note: "전 Domain snapshot assemble",
  },
  {
    path: "lib/community-messenger/cm-bootstrap-snapshot-assemble",
    status: "REPLACE",
    note: "lite 통합 assemble",
  },
  {
    path: "lib/community-messenger/home-sync-snapshot-assemble",
    status: "REPLACE",
    note: "home-sync 통합 assemble",
  },
  {
    path: "lib/community-messenger/cm-home-list-copy",
    status: "REPLACE",
    note: "통합 getRoomPreviewText — Domain PreviewPort 로 대체",
  },
  // —— QUARANTINE: Domain 재추론 / 오염 경로 ——
  {
    path: "lib/community-messenger/room-context-meta",
    status: "QUARANTINE",
    note: "contextMeta/summary/direct_key delivery 재추론",
  },
  {
    path: "lib/community-messenger/messenger-room-domain",
    status: "QUARANTINE",
    note: "direct_key commerce gates — confirmed* helpers 는 chatDomain 이지만 동일 파일 quarantine",
  },
  {
    path: "lib/chat-domain/messenger-domains",
    status: "QUARANTINE",
    note: "legacy MessengerDomain + inferMessengerDomainFromChatRoom",
  },
  {
    path: "lib/notifications/display/load-message-notification-display-context",
    status: "QUARANTINE",
    note: "resolveEffectiveRoomKind direct_key 재추론",
  },
  {
    path: "lib/chat-domain/use-cases/legacy-product-chat-create-or-get",
    status: "QUARANTINE",
    note: "legacy product chat bridge",
  },
  {
    path: "lib/community-messenger/trade-list-canonical-key",
    status: "QUARANTINE",
    note: "pc:/direct_key 기반 trade dedupe",
  },
  {
    path: "lib/community-messenger/delivery-list-canonical-key",
    status: "QUARANTINE",
    note: "meta/direct_key 기반 delivery key",
  },
  // —— DELETE_AFTER_CUTOVER ——
  {
    path: "lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade",
    status: "DELETE_AFTER_CUTOVER",
    note: "HS5 legacy trade unread merge",
  },
  {
    path: "lib/community-messenger/home/inbox-pipeline/shadow",
    status: "DELETE_AFTER_CUTOVER",
    note: "dual-path shadow dispatch",
  },
] as const;

export const MESSENGER_LEGACY_BANNED_IMPORT_PATHS: ReadonlyArray<string> = MESSENGER_LEGACY_CATALOG.filter(
  (e) => e.status === "REPLACE" || e.status === "QUARANTINE" || e.status === "DELETE_AFTER_CUTOVER"
).map((e) => e.path);

/** KEEP_CORE — 신규 모듈에서 import 허용 (메시지/Port/identity) */
export const MESSENGER_LEGACY_KEEP_CORE_PREFIXES: ReadonlyArray<string> = [
  "lib/chat-domain/chat-domain",
  "lib/chat-domain/room-identity",
  "lib/chat-domain/ports/",
  "lib/chat-domain/bootstrap/",
  "lib/chat-domain/cache/",
  "lib/chat-domain/badge/",
  "lib/chat-domain/read/",
  "lib/chat-domain/realtime/",
  "lib/chat-domain/notification/",
  "lib/chat-domain/sound/",
  "lib/chat-domain/routers/",
  "lib/chat-domain/shell/",
] as const;
