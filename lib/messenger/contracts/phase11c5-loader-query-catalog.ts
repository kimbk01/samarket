/**
 * Phase 11C.5 — Production Data Loader query catalog (감사 전용 · 최적화 없음).
 */
export type Phase11c5QueryCatalogRow = Readonly<{
  domain: string;
  query: string;
  purpose: string;
  filter: string;
  typicalReturn: string;
  duplicateLookup: "no" | "possible" | "yes";
  required: boolean;
  notes?: string;
}>;

export const PHASE11C5_LOADER_QUERY_CATALOG: ReadonlyArray<Phase11c5QueryCatalogRow> = [
  {
    domain: "general_direct",
    query: "gd_participants_rooms",
    purpose: "viewer 참가 general_direct room + unread",
    filter: "participants.user_id=viewer AND rooms.chat_domain=general_direct",
    typicalReturn: "viewer room count (≤200)",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "general_direct",
    query: "latest_messages",
    purpose: "방별 최신 메시지 batch",
    filter: "messages.room_id IN viewerRooms ORDER/limit per room",
    typicalReturn: "≤ 3× roomCount (현재 구현)",
    duplicateLookup: "no",
    required: true,
    notes: "N+1 없음 · batch",
  },
  {
    domain: "general_direct",
    query: "profiles",
    purpose: "peer display/avatar",
    filter: "profiles.id IN peerIds from identity",
    typicalReturn: "unique peers",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "group",
    query: "group_participants_rooms",
    purpose: "viewer membership group rooms",
    filter: "participants.user_id=viewer AND chat_domain=group",
    typicalReturn: "viewer groups",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "group",
    query: "group_members_batch",
    purpose: "memberCount 집계",
    filter: "participants.room_id IN groupRooms",
    typicalReturn: "members across groups",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "group",
    query: "latest_messages",
    purpose: "그룹 최신 메시지 batch",
    filter: "room_id IN groupRooms",
    typicalReturn: "batch",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "trade",
    query: "trade_participants_rooms",
    purpose: "viewer trade rooms",
    filter: "participants.user_id=viewer AND chat_domain=trade",
    typicalReturn: "viewer trade rooms",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "trade",
    query: "latest_messages",
    purpose: "거래 최신 메시지 batch",
    filter: "room_id IN tradeRooms",
    typicalReturn: "batch",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "trade",
    query: "profiles",
    purpose: "counterparty display",
    filter: "id IN counterparties",
    typicalReturn: "unique peers",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "store_order_customer",
    query: "store_orders_buyer",
    purpose: "buyer 주문 + store join (name/image)",
    filter: "buyer_user_id=viewer AND room_id NOT NULL",
    typicalReturn: "buyer orders",
    duplicateLookup: "no",
    required: true,
    notes: "store presentation은 이 join으로 충족 · profiles 없음",
  },
  {
    domain: "store_order_customer",
    query: "store_order_rooms",
    purpose: "identity_key / last_message summary 권한 필드",
    filter: "rooms.id IN order.roomIds AND chat_domain=store_order",
    typicalReturn: "order rooms",
    duplicateLookup: "possible",
    required: true,
    notes: "orders에 room 메타를 embed하면 중복 축소 가능(OPEN·최적화 금지)",
  },
  {
    domain: "store_order_customer",
    query: "store_order_unread",
    purpose: "viewer unread_count",
    filter: "user_id=viewer AND room_id IN orderRooms",
    typicalReturn: "participant rows",
    duplicateLookup: "possible",
    required: true,
    notes: "orders 경로에 participant embed 시 축소 후보",
  },
  {
    domain: "store_order_customer",
    query: "latest_messages",
    purpose: "주문채팅 최신 메시지 batch",
    filter: "room_id IN orderRooms",
    typicalReturn: "batch",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "owner_stores",
    purpose: "viewer 소유/관리 store 목록 (권한 scope)",
    filter: "stores.owner/manager = viewer (구현: owner relation)",
    typicalReturn: "owned stores",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "store_orders_owner",
    purpose: "허용 store 의 주문",
    filter: "store_id IN ownedStores AND room_id NOT NULL",
    typicalReturn: "owner orders",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "store_order_rooms_owner",
    purpose: "identity / summary",
    filter: "rooms.id IN ownerOrderRooms",
    typicalReturn: "rooms",
    duplicateLookup: "possible",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "store_order_unread_owner",
    purpose: "owner viewer unread",
    filter: "user_id=viewer AND room_id IN …",
    typicalReturn: "participants",
    duplicateLookup: "possible",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "latest_messages",
    purpose: "최신 메시지 batch",
    filter: "room_id IN …",
    typicalReturn: "batch",
    duplicateLookup: "no",
    required: true,
  },
  {
    domain: "store_order_owner",
    query: "profiles",
    purpose: "주문 고객 name/avatar",
    filter: "id IN buyer_user_ids",
    typicalReturn: "customers",
    duplicateLookup: "no",
    required: true,
  },
] as const;

export const PHASE11C5_LOADER_SECURITY_NOTES = {
  serviceRole: "live adapters use service role SELECTs",
  dbViewerScope:
    "first query always scopes by viewer_id (participants) or buyer_user_id / owned stores",
  memoryPermission:
    "BootstrapPort re-asserts Domain permission in memory; forged fixture rooms without viewer membership → 403",
  risk:
    "service role can read profiles/messages for IDs already selected — IDs must remain viewer-derived (현재 유지)",
  optimization: "not in Phase 11C.5 scope",
} as const;
