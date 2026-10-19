/**
 * 채팅 신고 단일 큐 (O-C10 · C-8) — 정규화 모델 · 상태 묶음 · 병합 페이지 · URL 상태.
 * 출처 3종: CM `community_messenger_reports` · 레거시 거래 `chat_reports` · 통합 `reports`(채팅 대상).
 * Client-safe pure module (DB 접근 없음) — 서버 로더와 화면이 같은 규칙을 쓴다.
 */

import {
  decodeAdminKeysetCursor,
  encodeAdminKeysetCursor,
  isAdminUuid,
  sanitizeAdminSearchTerm,
  type AdminKeysetCursor,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { CHAT_REPORT_OPEN_STATUSES } from "@/lib/admin/metrics/chat-metrics";

/**
 * 출처 키 = 채팅 대시보드 지표(`lib/admin/metrics/chat-metrics.ts` `ChatReportType`)와 같은 이름 —
 * 대시보드 숫자 → `?status=open&type=…` 링크가 이 큐의 같은 조건으로 열린다.
 */
export const CHAT_REPORT_SOURCES = ["messenger", "trade_chat", "trade_report"] as const;
export type ChatReportSource = (typeof CHAT_REPORT_SOURCES)[number];
export type ChatReportSourceFilter = ChatReportSource | "all";

/** 운영 상태 묶음 — `open` = 처리 대기(접수 + 검토 중, 기본 보기 · 대시보드 「지금 처리할 일」과 동일). */
export const CHAT_REPORT_STATUS_FILTERS = ["open", "received", "reviewing", "resolved", "dismissed", "all"] as const;
export type ChatReportStatusFilter = (typeof CHAT_REPORT_STATUS_FILTERS)[number];
export type ChatReportBucket = "received" | "reviewing" | "resolved" | "dismissed";

export const CHAT_REPORT_QUEUE_DEFAULT_LIMIT = 30;

const RAW_BY_SOURCE: Record<ChatReportSource, Record<ChatReportBucket, readonly string[]>> = {
  /** community_messenger_reports CHECK: received·reviewing·resolved·rejected·sanctioned */
  messenger: {
    received: ["received"],
    reviewing: ["reviewing"],
    resolved: ["resolved", "sanctioned"],
    dismissed: ["rejected"],
  },
  /** 레거시 거래 `chat_reports` (`ChatReportStatus`): received·triaging·escalated·actioned·dismissed */
  trade_chat: {
    received: ["received"],
    reviewing: ["triaging", "escalated"],
    resolved: ["actioned"],
    dismissed: ["dismissed"],
  },
  /** 통합 `reports` (target_type chat_room·chat_message — 큐·대시보드 모두 두 유형) */
  trade_report: {
    received: ["pending"],
    reviewing: ["reviewing"],
    resolved: ["resolved", "sanctioned", "reviewed"],
    dismissed: ["rejected"],
  },
};

/** 서버 필터용 원시 상태 목록. `null` = 상태 조건 없음. */
export function chatReportRawStatuses(
  source: ChatReportSource,
  filter: ChatReportStatusFilter
): string[] | null {
  if (filter === "all") return null;
  const map = RAW_BY_SOURCE[source];
  // 「처리 대기」 = 대시보드 지표와 같은 단일 정의.
  if (filter === "open") return [...CHAT_REPORT_OPEN_STATUSES[source]];
  return [...map[filter]];
}

export function chatReportBucketOf(source: ChatReportSource, raw: string | null | undefined): ChatReportBucket {
  const r = String(raw ?? "").trim().toLowerCase();
  const map = RAW_BY_SOURCE[source];
  for (const bucket of ["received", "reviewing", "resolved", "dismissed"] as const) {
    if (map[bucket].includes(r)) return bucket;
  }
  return "received";
}

export type ChatReportQueueRow = {
  /** `${source}:${id}` — 병합 정렬 tie-break · 커서 id. */
  key: string;
  source: ChatReportSource;
  id: string;
  createdAt: string;
  rawStatus: string;
  bucket: ChatReportBucket;
  /** room · message · user · chat_room · chat_message */
  targetType: string;
  reasonCode: string;
  reasonDetail: string;
  roomId: string | null;
  /** 방 상세 종류 — CM 방 상세 vs 레거시 거래 채팅 상세. */
  roomKind: "cm" | "legacy_trade" | null;
  messageId: string | null;
  reporterId: string | null;
  reporterLabel: string;
  reportedUserId: string | null;
  reportedUserLabel: string;
  adminNote: string;
  handledAt: string | null;
};

/** 정렬 — 최신순(createdAt DESC, key DESC) · `asc` = 오래된 순(처리 대기 기본, 먼저 들어온 것부터). */
export function compareChatReportQueueRows(a: ChatReportQueueRow, b: ChatReportQueueRow, asc = false): number {
  const ta = Date.parse(a.createdAt) || 0;
  const tb = Date.parse(b.createdAt) || 0;
  const d = ta !== tb ? tb - ta : a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  return asc ? -d : d;
}

/** 커서보다 뒤인가 — 정렬 순서 기준 strictly after. */
export function isAfterChatReportCursor(row: ChatReportQueueRow, cursor: AdminKeysetCursor | null, asc = false): boolean {
  if (!cursor) return true;
  const tr = Date.parse(row.createdAt) || 0;
  const tc = Date.parse(cursor.ts) || 0;
  if (tr !== tc) return asc ? tr > tc : tr < tc;
  return asc ? row.key > cursor.id : row.key < cursor.id;
}

export type ChatReportSourceBatch = {
  rows: ChatReportQueueRow[];
  /** 출처가 요청 수만큼 채워 반환했는가 (더 있을 수 있음). */
  full: boolean;
};

/**
 * 출처별 (createdAt ≤ cursor.ts, 최신순, fetchSize 건) 결과를 병합해 한 페이지를 만든다.
 * 각 출처가 페이지 크기 이상을 주거나 소진되었으면 병합 상위 N 건은 전역 정렬과 같다.
 */
export function mergeChatReportQueuePage(
  batches: ChatReportSourceBatch[],
  cursor: AdminKeysetCursor | null,
  limit: number,
  asc = false
): { rows: ChatReportQueueRow[]; nextCursor: string | null } {
  const merged = batches
    .flatMap((b) => b.rows)
    .filter((r) => isAfterChatReportCursor(r, cursor, asc))
    .sort((a, b) => compareChatReportQueueRows(a, b, asc));
  const rows = merged.slice(0, limit);
  const more = merged.length > limit || batches.some((b) => b.full);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: more && last ? encodeAdminKeysetCursor({ ts: last.createdAt, id: last.key }) : null,
  };
}

// ── URL 상태 ──────────────────────────────────────────────

export type ChatReportQueueQuery = {
  source: ChatReportSourceFilter;
  status: ChatReportStatusFilter;
  /** 방 ID 또는 회원 ID (신고자·피신고자) — 「신고 보기」 딥링크 파라미터. */
  target: string;
  /** 검색 — 회원 ID(UUID)·방 ID 는 target 과 같은 조건, 그 외는 신고자·피신고자 닉네임 */
  q: string;
  /** "" = 기본(처리 대기 계열은 오래된 순, 그 외 최신 순) · oldest · newest */
  sort: "" | "oldest" | "newest";
  cursor: string;
};

/** 실제 정렬 방향 — 처리 대기(open·received·reviewing)는 먼저 들어온 신고부터 (설계 §3-2). */
export function chatReportQueueAscending(q: Pick<ChatReportQueueQuery, "sort" | "status">): boolean {
  if (q.sort === "oldest") return true;
  if (q.sort === "newest") return false;
  return q.status === "open" || q.status === "received" || q.status === "reviewing";
}

type SearchLike = URLSearchParams | { get(name: string): string | null };

/** 예전 화면 이름 호환 (`source=trade_legacy|reports`). */
const LEGACY_SOURCE_ALIAS: Record<string, ChatReportSource> = {
  trade_legacy: "trade_chat",
  reports: "trade_report",
};

export function parseChatReportQueueQuery(sp: SearchLike): ChatReportQueueQuery {
  const sourceRaw = (sp.get("type") ?? sp.get("source") ?? "").trim();
  const source = LEGACY_SOURCE_ALIAS[sourceRaw] ?? sourceRaw;
  const status = (sp.get("status") ?? "").trim();
  const target = (sp.get("target") ?? sp.get("targetId") ?? sp.get("room") ?? "").trim();
  return {
    source: (CHAT_REPORT_SOURCES as readonly string[]).includes(source) ? (source as ChatReportSource) : "all",
    status: (CHAT_REPORT_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as ChatReportStatusFilter)
      : "open",
    target: isAdminUuid(target) ? target.toLowerCase() : "",
    q: sanitizeAdminSearchTerm(sp.get("q")),
    sort: sp.get("sort") === "oldest" ? "oldest" : sp.get("sort") === "newest" ? "newest" : "",
    cursor: decodeAdminKeysetCursor(sp.get("cursor")) ? (sp.get("cursor") ?? "").trim() : "",
  };
}

/** URL 쿼리 (선두 `?` 포함). 기본값(type=all, status=open)은 생략. */
export function buildChatReportQueueSearch(q: Partial<ChatReportQueueQuery>): string {
  const sp = new URLSearchParams();
  if (q.source && q.source !== "all") sp.set("type", q.source);
  if (q.status && q.status !== "open") sp.set("status", q.status);
  if (q.target) sp.set("target", q.target);
  if (q.q) sp.set("q", q.q);
  if (q.sort) sp.set("sort", q.sort);
  if (q.cursor) sp.set("cursor", q.cursor);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function chatReportSourcesFor(filter: ChatReportSourceFilter): ChatReportSource[] {
  return filter === "all" ? [...CHAT_REPORT_SOURCES] : [filter];
}
