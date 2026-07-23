/**
 * Phase 1 — DIBAY Messenger Domain Port 계약 (타입만).
 *
 * 런타임 권위·fetch·UI 연결은 Phase 2+에서 Domain별로 구현한다.
 * 이 파일은 새 `lib/messenger/*` 모듈의 SSOT 계약이며,
 * 기존 `lib/chat-domain/ports/*` accept-gate 와 병행한다(교체 전 이중 writer 금지).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { DomainRoomIdentity } from "@/lib/chat-domain/room-identity";

/** 저장된 Domain 소유 Room — Shell/원본 공유 배열에 넣지 않는다. */
export type DomainOwnedRoomRef = Readonly<{
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
}>;

export type DomainListQuery = Readonly<{
  viewerUserId: string;
  generation?: string | null;
}>;

export type DomainListSnapshot<TRow> = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  rows: ReadonlyArray<TRow>;
}>;

export type DomainDisplayIdentity = Readonly<{
  title: string;
  avatarUrl: string | null;
  /** 진단용 — peer/user fallback 사용 여부 (store_order customer 는 항상 false 계약) */
  usedPeerUserFallback: false | true;
}>;

export type DomainHeaderKind =
  | "general_peer"
  | "group"
  | "trade"
  | "buyer_store"
  | "owner_buyer_peer";

export type DomainPreviewSource =
  | "latest_user_message"
  | "allowed_system_message"
  | "empty";

export type DomainPreview = Readonly<{
  text: string;
  source: DomainPreviewSource;
}>;

export type MessengerRouterPort = Readonly<{
  domain: ChatDomain;
  /** entry context 전달만 — pathname/from 으로 Domain 판정 금지 */
  buildRoomHref: (input: {
    roomId: string;
    identityKey: string;
    returnHref?: string | null;
    permissionContext?: string | null;
  }) => string;
}>;

export type MessengerIdentityPort = Readonly<{
  domain: ChatDomain;
  assertMatches: (room: DomainOwnedRoomRef) => DomainOwnedRoomRef;
  /** 생성 시 Identity — Phase 2+ 에서 LOCK builders 위임 */
  build?: (...args: never[]) => DomainRoomIdentity;
}>;

export type MessengerListPort<TRow = unknown> = Readonly<{
  domain: ChatDomain;
  /** Phase 2+: 자기 Domain row 만. 타 Domain row 반환은 서버 오류 */
  listContract: DomainListQuery;
  rowTypeMarker?: TRow;
}>;

export type MessengerRowModelPort<TRow = unknown> = Readonly<{
  domain: ChatDomain;
  /** Phase 2+: DomainOwnedRoom → 목록 행 VM */
  contractMarker?: TRow;
}>;

export type MessengerPresentationPort = Readonly<{
  domain: ChatDomain;
  resolveDisplayIdentity: (input: DomainOwnedRoomRef) => DomainDisplayIdentity;
}>;

export type MessengerHeaderPort = Readonly<{
  domain: ChatDomain;
  resolveHeaderKind: (input: DomainOwnedRoomRef & { viewerRole?: string | null }) => DomainHeaderKind;
}>;

export type MessengerPreviewPort = Readonly<{
  domain: ChatDomain;
  /** 실제 최신 메시지만 — order/product summary·headline·room.title 금지 */
  resolvePreview: (input: DomainOwnedRoomRef) => DomainPreview;
}>;

export type MessengerBootstrapPort = Readonly<{
  domain: ChatDomain;
  /** Phase 6 권위 — Phase 1~5 는 계약만 */
  acceptsOnlyOwnDomain: true;
}>;

export type MessengerCachePort = Readonly<{
  domain: ChatDomain;
  /** namespace: chat.{domain}.* — 타 Domain key 수정 금지 */
  namespacePrefix: string;
  /** Phase 1: 읽기 전용 계약. write 권위는 cutover ON + Phase 6 */
  readOnlyUntilCutover: true;
}>;

export type MessengerRealtimePort = Readonly<{
  domain: ChatDomain;
  /** domain+identityKey+roomId+viewerUserId+eventId+generation 필수 */
  requiresDomainTaggedPayload: true;
}>;

export type MessengerReadPort = Readonly<{
  domain: ChatDomain;
  authority: "community_messenger" | "trade_domain" | "order_domain";
}>;

export type MessengerUnreadPort = Readonly<{
  domain: ChatDomain;
  /** 한 unread 는 한 Domain 에만 소속 */
  exclusiveOwnership: true;
}>;

export type MessengerBadgePort = Readonly<{
  domain: ChatDomain;
  /** Hub / Nav contribution / AppIcon contribution 의 Domain SSOT */
  contributesTo: ReadonlyArray<"hub" | "nav_messenger" | "nav_delivery" | "nav_trade" | "app_icon">;
}>;

export type MessengerNotificationPort = Readonly<{
  domain: ChatDomain;
  requiresStoredChatDomain: true;
}>;

export type MessengerSoundPort = Readonly<{
  domain: ChatDomain;
  soundKeyContract: string;
}>;

export type MessengerPermissionPort = Readonly<{
  domain: ChatDomain;
  /** 서버/RLS 권위 — 클라 필터만으로 누수 차단 금지 */
  serverAuthoritative: true;
}>;

/** Domain 모듈이 노출해야 하는 Port 묶음 */
export type MessengerDomainPorts = Readonly<{
  domain: ChatDomain;
  router: MessengerRouterPort;
  identity: MessengerIdentityPort;
  list: MessengerListPort;
  rowModel: MessengerRowModelPort;
  presentation: MessengerPresentationPort;
  header: MessengerHeaderPort;
  preview: MessengerPreviewPort;
  bootstrap: MessengerBootstrapPort;
  cache: MessengerCachePort;
  realtime: MessengerRealtimePort;
  read: MessengerReadPort;
  unread: MessengerUnreadPort;
  badge: MessengerBadgePort;
  notification: MessengerNotificationPort;
  sound: MessengerSoundPort;
  permission: MessengerPermissionPort;
}>;
