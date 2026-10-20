/**
 * 채팅 신고 단일 큐 서버 로더 (O-C10).
 * CM `community_messenger_reports` + 레거시 거래 `chat_reports` + 통합 `reports`(target_type chat_room·chat_message)
 * 를 같은 정규화 행으로 읽는다. 조치는 각 출처의 기존 action API.
 *
 * R7 — 3원천 병합·정렬·페이지·전체 건수는 DB 한 번(`admin_chat_report_queue_page` RPC, limit/offset + total).
 * 닉네임 검색은 RPC 안의 조인 조건 — 후보 회원을 N명만 먼저 찾는 상한이 없다.
 * Server-only (service-role client) — client 컴포넌트에서 import 금지.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isAdminUuid } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import {
  CHAT_REPORT_SOURCES,
  chatReportQueueAscending,
  chatReportBucketOf,
  chatReportRawStatuses,
  chatReportSourcesFor,
  type ChatReportQueueQuery,
  type ChatReportQueueRow,
  type ChatReportSource,
} from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: unknown) => s(v) || null;

export const CHAT_REPORT_QUEUE_RPC = "admin_chat_report_queue_page";

export type ChatReportQueuePage = {
  rows: ChatReportQueueRow[];
  /** 필터 조건 전체 건수 (DB count). */
  total: number;
  limit: number;
  offset: number;
  /** R7 이후 항상 null — 예전 keyset 응답 모양 호환 필드. */
  nextCursor: string | null;
  /** 읽지 못한 출처 (부분 실패) — RPC 한 번이므로 성공 시 항상 빈 배열 (응답 모양 호환). */
  failedSources: ChatReportSource[];
};

type RpcRow = {
  source?: unknown;
  id?: unknown;
  created_at?: unknown;
  raw_status?: unknown;
  target_type?: unknown;
  target_id?: unknown;
  reason_code?: unknown;
  reason_detail?: unknown;
  room_id?: unknown;
  message_id?: unknown;
  reporter_id?: unknown;
  reported_user_id?: unknown;
  admin_note?: unknown;
  handled_at?: unknown;
  updated_at?: unknown;
};

function isSource(v: string): v is ChatReportSource {
  return (CHAT_REPORT_SOURCES as readonly string[]).includes(v);
}

/** RPC 행 → 화면 행 (예전 원천별 매핑과 같은 규칙). */
export function mapChatReportQueueRpcRow(r: RpcRow): ChatReportQueueRow | null {
  const source = s(r.source);
  if (!isSource(source)) return null;
  const id = s(r.id);
  const raw = s(r.raw_status);
  const bucket = chatReportBucketOf(source, raw);
  const base = {
    key: `${source}:${id}`,
    source,
    id,
    createdAt: s(r.created_at),
    rawStatus: raw,
    bucket,
    reasonCode: s(r.reason_code),
    reasonDetail: s(r.reason_detail),
    reporterId: orNull(r.reporter_id),
    reporterLabel: "",
    reportedUserLabel: "",
  };
  if (source === "messenger") {
    return {
      ...base,
      targetType: s(r.target_type) || "room",
      roomId: orNull(r.room_id),
      roomKind: s(r.room_id) ? "cm" : null,
      messageId: orNull(r.message_id),
      reportedUserId: orNull(r.reported_user_id),
      adminNote: s(r.admin_note),
      handledAt: orNull(r.handled_at),
    };
  }
  if (source === "trade_chat") {
    return {
      ...base,
      targetType: s(r.target_type) || (s(r.message_id) ? "message" : "room"),
      roomId: orNull(r.room_id),
      roomKind: s(r.room_id) ? "legacy_trade" : null,
      messageId: orNull(r.message_id),
      reportedUserId: orNull(r.reported_user_id),
      adminNote: "",
      handledAt: bucket === "received" || bucket === "reviewing" ? null : orNull(r.updated_at),
    };
  }
  const targetType = s(r.target_type);
  const roomId = s(r.room_id) || (targetType === "chat_room" ? s(r.target_id) : "");
  return {
    ...base,
    targetType,
    roomId: roomId || null,
    roomKind: roomId ? "legacy_trade" : null,
    messageId: targetType === "chat_message" ? orNull(r.target_id) : null,
    reportedUserId: null,
    adminNote: s(r.admin_note),
    // RPC 의 handled_at = reports.resolved_at
    handledAt: orNull(r.handled_at),
  };
}

/** RPC 인자 — 상태 묶음은 TS 계약(`chatReportRawStatuses`)을 원천별로 넘긴다. */
export function chatReportQueueRpcArgs(
  query: ChatReportQueueQuery,
  page: { limit: number; offset: number }
): Record<string, unknown> {
  const sources = chatReportSourcesFor(query.source, query.domain);
  const statuses: Record<string, string[]> = {};
  let anyStatus = false;
  for (const src of sources) {
    const list = chatReportRawStatuses(src, query.status);
    if (list) {
      statuses[src] = list;
      anyStatus = true;
    }
  }
  return {
    p_sources: sources,
    p_statuses: anyStatus ? statuses : null,
    p_target: query.target || null,
    p_q: query.q || null,
    p_domain: query.domain || null,
    p_asc: chatReportQueueAscending(query),
    p_limit: page.limit,
    p_offset: page.offset,
  };
}

export async function listChatReportQueue(
  input: ChatReportQueueQuery,
  page: { limit: number; offset: number }
): Promise<ChatReportQueuePage> {
  const sb = getSupabaseServer();
  // 검색어가 UUID 면 방·회원 대상(target)과 같은 조건, 아니면 신고자·피신고자 닉네임.
  const query: ChatReportQueueQuery =
    input.q && isAdminUuid(input.q) && !input.target ? { ...input, target: input.q.toLowerCase(), q: "" } : input;
  const empty: ChatReportQueuePage = {
    rows: [],
    total: 0,
    limit: page.limit,
    offset: page.offset,
    nextCursor: null,
    failedSources: [],
  };
  if (!chatReportSourcesFor(query.source, query.domain).length) return empty;

  const { data, error } = await sb.rpc(CHAT_REPORT_QUEUE_RPC, chatReportQueueRpcArgs(query, page));
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { total?: unknown; rows?: unknown };
  const rows = (Array.isArray(payload.rows) ? (payload.rows as RpcRow[]) : [])
    .map(mapChatReportQueueRpcRow)
    .filter((r): r is ChatReportQueueRow => r != null);
  const total = Number(payload.total);

  const userIds = [...new Set(rows.flatMap((r) => [r.reporterId ?? "", r.reportedUserId ?? ""]).filter(Boolean))];
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", userIds);
    const labelById = new Map(
      ((profiles ?? []) as Array<{ id: string; nickname?: string | null; username?: string | null }>).map((p) => [
        p.id,
        s(p.nickname) || s(p.username),
      ])
    );
    const label = (id: string | null) =>
      id ? labelById.get(id) || `회원 ${id.replace(/-/g, "").slice(0, 8)}` : "";
    for (const row of rows) {
      row.reporterLabel = label(row.reporterId);
      row.reportedUserLabel = label(row.reportedUserId);
    }
  }
  return {
    ...empty,
    rows,
    total: Number.isFinite(total) && total >= 0 ? total : rows.length,
  };
}
