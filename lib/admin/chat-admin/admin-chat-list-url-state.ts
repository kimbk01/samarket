/**
 * 채팅 Admin 목록 URL 상태 (C-11) — 검색·필터·keyset 커서를 쿼리스트링 하나로.
 * Client-safe pure module: 목록 화면(URL 동기화)과 서버 API(파라미터 파싱)가 같은 규칙을 쓴다.
 */

export const ADMIN_CHAT_ROOM_DOMAINS = ["general_direct", "group", "trade", "store_order"] as const;
export type AdminChatRoomDomain = (typeof ADMIN_CHAT_ROOM_DOMAINS)[number];
export type AdminChatRoomTypeFilter = AdminChatRoomDomain | "all";

export const ADMIN_CHAT_ROOM_STATUSES = ["active", "blocked", "archived"] as const;
export type AdminChatRoomStatusFilter = (typeof ADMIN_CHAT_ROOM_STATUSES)[number] | "";

export const ADMIN_CHAT_LIST_DEFAULT_LIMIT = 30;
export const ADMIN_CHAT_LIST_MAX_LIMIT = 100;

/**
 * 채팅 대시보드 지표 링크와 합의된 파라미터 (`lib/admin/metrics/chat-metrics.ts` `chatRoomListHref`):
 * `domain`(= type 별칭) · `status` · `activity=7d` · `idle=90`.
 */
export type AdminChatRoomListQuery = {
  type: AdminChatRoomTypeFilter;
  status: AdminChatRoomStatusFilter;
  /** 최근 7일 활동 방만 (`activity=7d`). */
  activity: "" | "7d";
  /** N일 이상 미사용 방만 (`idle=90`). 0 = 조건 없음. */
  idleDays: number;
  q: string;
  userId: string;
  reported: boolean;
  cursor: string;
  /** 정렬 — "" = 최근 메시지 순(기본) · "created" = 생성 순 */
  sort: "" | "created";
  /** 거래 딥링크 (상품 상세·거래 흐름에서 진입) */
  postId: string;
  buyerId: string;
  sellerId: string;
  /** 배달 주문 딥링크 */
  orderId: string;
};

type SearchLike = URLSearchParams | { get(name: string): string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

export function isAdminChatRoomDomain(value: unknown): value is AdminChatRoomDomain {
  return typeof value === "string" && (ADMIN_CHAT_ROOM_DOMAINS as readonly string[]).includes(value);
}

/** PostgREST `or()`/`ilike` 에 안전한 검색어 — 구분자·와일드카드 제거, 80자 제한. */
export function sanitizeAdminSearchTerm(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[,()%*\\"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parseAdminChatRoomListQuery(
  sp: SearchLike,
  fixedType?: AdminChatRoomTypeFilter
): AdminChatRoomListQuery {
  const typeRaw = (sp.get("type") ?? sp.get("domain") ?? "").trim();
  const idleRaw = Math.floor(Number(sp.get("idle")));
  const statusRaw = (sp.get("status") ?? "").trim();
  const userRaw = (sp.get("user_id") ?? "").trim();
  return {
    type: fixedType ?? (isAdminChatRoomDomain(typeRaw) ? typeRaw : "all"),
    status: (ADMIN_CHAT_ROOM_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as AdminChatRoomStatusFilter)
      : "",
    activity: sp.get("activity") === "7d" ? "7d" : "",
    idleDays: Number.isFinite(idleRaw) && idleRaw > 0 ? Math.min(idleRaw, 3650) : 0,
    q: sanitizeAdminSearchTerm(sp.get("q") ?? sp.get("room")),
    userId: isAdminUuid(userRaw) ? userRaw.toLowerCase() : "",
    reported: sp.get("reported") === "1",
    cursor: (sp.get("cursor") ?? "").trim().slice(0, 200),
    sort: sp.get("sort") === "created" ? "created" : "",
    postId: uuidParam(sp, "postId"),
    buyerId: uuidParam(sp, "buyerId"),
    sellerId: uuidParam(sp, "sellerId"),
    orderId: uuidParam(sp, "orderId"),
  };
}

function uuidParam(sp: SearchLike, name: string): string {
  const v = (sp.get(name) ?? "").trim();
  return isAdminUuid(v) ? v.toLowerCase() : "";
}

/** 딥링크·정렬 파라미터 (화면 URL·API 공통). */
function appendAdminChatRoomExtras(sp: URLSearchParams, query: Partial<AdminChatRoomListQuery>): void {
  if (query.sort) sp.set("sort", query.sort);
  if (query.postId) sp.set("postId", query.postId);
  if (query.buyerId) sp.set("buyerId", query.buyerId);
  if (query.sellerId) sp.set("sellerId", query.sellerId);
  if (query.orderId) sp.set("orderId", query.orderId);
}

/**
 * 「이전」 페이지 — keyset 은 앞으로만 가므로 지나온 커서를 URL `trail` 에 쌓는다 (브라우저 뒤로가기 의존 없음).
 * 다음: trail += 현재 cursor(없으면 "-"), cursor = next · 이전: cursor = trail 마지막, trail 에서 제거.
 */
export const ADMIN_LIST_TRAIL_PARAM = "trail";
const TRAIL_MAX = 50;

export function readAdminListTrail(sp: SearchLike): string[] {
  const raw = (sp.get(ADMIN_LIST_TRAIL_PARAM) ?? "").trim();
  return raw ? raw.split(",").slice(-TRAIL_MAX) : [];
}

export function adminListNextPage(trail: string[], cursor: string, next: string): { trail: string[]; cursor: string } {
  return { trail: [...trail, cursor || "-"].slice(-TRAIL_MAX), cursor: next };
}

export function adminListPrevPage(trail: string[]): { trail: string[]; cursor: string } {
  const prev = trail[trail.length - 1] ?? "-";
  return { trail: trail.slice(0, -1), cursor: prev === "-" ? "" : prev };
}

export function withAdminListTrail(search: string, trail: string[]): string {
  if (!trail.length) return search;
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  sp.set(ADMIN_LIST_TRAIL_PARAM, trail.join(","));
  return `?${sp.toString()}`;
}

/**
 * URL 쿼리 (선두 `?` 포함, 비어 있으면 ""). 기본값은 생략한다.
 * `fixedType` 화면(일반·그룹)은 `type` 을 쓰지 않는다.
 */
export function buildAdminChatRoomListSearch(
  query: Partial<AdminChatRoomListQuery>,
  opts?: { fixedType?: boolean }
): string {
  const sp = new URLSearchParams();
  if (!opts?.fixedType && query.type && query.type !== "all") sp.set("type", query.type);
  if (query.status) sp.set("status", query.status);
  if (query.activity) sp.set("activity", query.activity);
  if (query.idleDays) sp.set("idle", String(query.idleDays));
  if (query.q) sp.set("q", query.q);
  if (query.userId) sp.set("user_id", query.userId);
  if (query.reported) sp.set("reported", "1");
  appendAdminChatRoomExtras(sp, query);
  if (query.cursor) sp.set("cursor", query.cursor);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** API 요청용 쿼리 — `type` 은 항상 포함 (서버가 화면 고정 유형을 알 수 있도록). */
export function buildAdminChatRoomListApiSearch(query: AdminChatRoomListQuery, limit: number): string {
  const sp = new URLSearchParams();
  sp.set("type", query.type);
  if (query.status) sp.set("status", query.status);
  if (query.activity) sp.set("activity", query.activity);
  if (query.idleDays) sp.set("idle", String(query.idleDays));
  if (query.q) sp.set("q", query.q);
  if (query.userId) sp.set("user_id", query.userId);
  if (query.reported) sp.set("reported", "1");
  appendAdminChatRoomExtras(sp, query);
  if (query.cursor) sp.set("cursor", query.cursor);
  sp.set("limit", String(limit));
  return `?${sp.toString()}`;
}

export function clampAdminChatListLimit(raw: string | number | null | undefined): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return ADMIN_CHAT_LIST_DEFAULT_LIMIT;
  return Math.min(n, ADMIN_CHAT_LIST_MAX_LIMIT);
}

/** keyset 커서 — (정렬 시각, id). 시각이 없으면 빈 문자열(NULLS LAST 구간). */
export type AdminKeysetCursor = { ts: string; id: string };

export function encodeAdminKeysetCursor(c: AdminKeysetCursor): string {
  return `${c.ts}~${c.id}`;
}

export function decodeAdminKeysetCursor(raw: string | null | undefined): AdminKeysetCursor | null {
  const s = String(raw ?? "").trim();
  const i = s.lastIndexOf("~");
  if (i < 0) return null;
  const ts = s.slice(0, i);
  const id = s.slice(i + 1);
  if (!id || !/^[0-9a-zA-Z:_-]{1,80}$/.test(id)) return null;
  if (ts && !Number.isFinite(Date.parse(ts))) return null;
  return { ts, id };
}

/** 현재 화면 경로 + 쿼리 — 상세 링크의 `returnTo` 값. */
export function currentAdminListHref(pathname: string, search: string): string {
  const q = search && !search.startsWith("?") ? `?${search}` : search;
  return `${pathname}${q}`;
}
