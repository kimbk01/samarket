/**
 * 채팅 신고 단일 큐 서버 로더 (O-C10).
 * CM `community_messenger_reports` + 레거시 거래 `chat_reports` + 통합 `reports`(target_type chat_room)
 * 를 같은 정규화 행으로 읽어 created_at 최신순 keyset 페이지로 병합한다. 조치는 각 출처의 기존 action API.
 * Server-only (service-role client) — client 컴포넌트에서 import 금지.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { decodeAdminKeysetCursor } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import {
  chatReportBucketOf,
  chatReportRawStatuses,
  chatReportSourcesFor,
  mergeChatReportQueuePage,
  type ChatReportQueueQuery,
  type ChatReportQueueRow,
  type ChatReportSource,
  type ChatReportSourceBatch,
} from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

type Sb = ReturnType<typeof getSupabaseServer>;

/** 같은 시각 경계 여유분 (in-memory 커서 필터로 정확히 자른다). */
const FETCH_EXTRA = 10;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: unknown) => s(v) || null;

/** 커서 시각 + 1ms (PG µs 정밀도 대비) — 상한은 넉넉히, 정확한 경계는 병합 단계에서. */
function upperBound(ts: string): string | null {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? new Date(t + 1).toISOString() : null;
}

type Fetched = { rows: ChatReportQueueRow[]; full: boolean };

async function fetchMessenger(sb: Sb, q: ChatReportQueueQuery, upper: string | null, size: number): Promise<Fetched> {
  let rq = sb
    .from("community_messenger_reports")
    .select("id, report_type, room_id, message_id, reported_user_id, reporter_user_id, reason_type, reason_detail, status, admin_note, handled_at, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(size);
  const statuses = chatReportRawStatuses("messenger", q.status);
  if (statuses) rq = rq.in("status", statuses);
  if (upper) rq = rq.lte("created_at", upper);
  if (q.target) rq = rq.or(`room_id.eq.${q.target},reported_user_id.eq.${q.target},reporter_user_id.eq.${q.target}`);
  const { data, error } = await rq;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Record<string, unknown>[]).map<ChatReportQueueRow>((r) => ({
    key: `messenger:${s(r.id)}`,
    source: "messenger",
    id: s(r.id),
    createdAt: s(r.created_at),
    rawStatus: s(r.status),
    bucket: chatReportBucketOf("messenger", s(r.status)),
    targetType: s(r.report_type) || "room",
    reasonCode: s(r.reason_type),
    reasonDetail: s(r.reason_detail),
    roomId: orNull(r.room_id),
    roomKind: s(r.room_id) ? "cm" : null,
    messageId: orNull(r.message_id),
    reporterId: orNull(r.reporter_user_id),
    reporterLabel: "",
    reportedUserId: orNull(r.reported_user_id),
    reportedUserLabel: "",
    adminNote: s(r.admin_note),
    handledAt: orNull(r.handled_at),
  }));
  return { rows, full: rows.length >= size };
}

async function fetchTradeLegacy(sb: Sb, q: ChatReportQueueQuery, upper: string | null, size: number): Promise<Fetched> {
  let rq = sb
    .from("chat_reports")
    .select("id, room_id, message_id, report_type, reporter_user_id, reported_user_id, reason_type, reason_detail, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(size);
  const statuses = chatReportRawStatuses("trade_chat", q.status);
  if (statuses) rq = rq.in("status", statuses);
  if (upper) rq = rq.lte("created_at", upper);
  if (q.target) rq = rq.or(`room_id.eq.${q.target},reported_user_id.eq.${q.target},reporter_user_id.eq.${q.target}`);
  const { data, error } = await rq;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Record<string, unknown>[]).map<ChatReportQueueRow>((r) => {
    const raw = s(r.status);
    const bucket = chatReportBucketOf("trade_chat", raw);
    return {
      key: `trade_chat:${s(r.id)}`,
      source: "trade_chat",
      id: s(r.id),
      createdAt: s(r.created_at),
      rawStatus: raw,
      bucket,
      targetType: s(r.report_type) || (s(r.message_id) ? "message" : "room"),
      reasonCode: s(r.reason_type),
      reasonDetail: s(r.reason_detail),
      roomId: orNull(r.room_id),
      roomKind: s(r.room_id) ? "legacy_trade" : null,
      messageId: orNull(r.message_id),
      reporterId: orNull(r.reporter_user_id),
      reporterLabel: "",
      reportedUserId: orNull(r.reported_user_id),
      reportedUserLabel: "",
      adminNote: "",
      handledAt: bucket === "received" || bucket === "reviewing" ? null : orNull(r.updated_at),
    };
  });
  return { rows, full: rows.length >= size };
}

async function fetchReports(sb: Sb, q: ChatReportQueueQuery, upper: string | null, size: number): Promise<Fetched> {
  let rq = sb
    .from("reports")
    .select("id, reporter_id, target_type, target_id, room_id, reason_code, reason_text, status, admin_note, created_at, resolved_at")
    // 채팅 대시보드 지표 `chat.reports_open.trade_report` 와 같은 대상 (target_type=chat_room).
    .eq("target_type", "chat_room")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(size);
  const statuses = chatReportRawStatuses("trade_report", q.status);
  if (statuses) rq = rq.in("status", statuses);
  if (upper) rq = rq.lte("created_at", upper);
  if (q.target) rq = rq.or(`room_id.eq.${q.target},target_id.eq.${q.target},reporter_id.eq.${q.target}`);
  const { data, error } = await rq;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Record<string, unknown>[]).map<ChatReportQueueRow>((r) => {
    const targetType = s(r.target_type);
    const roomId = s(r.room_id) || (targetType === "chat_room" ? s(r.target_id) : "");
    return {
      key: `trade_report:${s(r.id)}`,
      source: "trade_report",
      id: s(r.id),
      createdAt: s(r.created_at),
      rawStatus: s(r.status),
      bucket: chatReportBucketOf("trade_report", s(r.status)),
      targetType,
      reasonCode: s(r.reason_code),
      reasonDetail: s(r.reason_text),
      roomId: roomId || null,
      roomKind: roomId ? "legacy_trade" : null,
      messageId: targetType === "chat_message" ? orNull(r.target_id) : null,
      reporterId: orNull(r.reporter_id),
      reporterLabel: "",
      reportedUserId: null,
      reportedUserLabel: "",
      adminNote: s(r.admin_note),
      handledAt: orNull(r.resolved_at),
    };
  });
  return { rows, full: rows.length >= size };
}

const FETCHERS: Record<ChatReportSource, typeof fetchMessenger> = {
  messenger: fetchMessenger,
  trade_chat: fetchTradeLegacy,
  trade_report: fetchReports,
};

export type ChatReportQueuePage = {
  rows: ChatReportQueueRow[];
  nextCursor: string | null;
  /** 읽지 못한 출처 (부분 실패) — 화면에서 「일부 출처 불러오기 실패」로 구분 표시. */
  failedSources: ChatReportSource[];
};

export async function listChatReportQueue(query: ChatReportQueueQuery, limit: number): Promise<ChatReportQueuePage> {
  const sb = getSupabaseServer();
  const cursor = decodeAdminKeysetCursor(query.cursor);
  const upper = cursor ? upperBound(cursor.ts) : null;
  const size = limit + 1 + FETCH_EXTRA;
  const sources = chatReportSourcesFor(query.source);
  const settled = await Promise.allSettled(sources.map((src) => FETCHERS[src](sb, query, upper, size)));
  const failedSources: ChatReportSource[] = [];
  const batches: ChatReportSourceBatch[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") batches.push(r.value);
    else failedSources.push(sources[i]!);
  });
  if (batches.length === 0) throw new Error("report_sources_unavailable");

  const page = mergeChatReportQueuePage(batches, cursor, limit);

  const userIds = [
    ...new Set(page.rows.flatMap((r) => [r.reporterId ?? "", r.reportedUserId ?? ""]).filter(Boolean)),
  ];
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
    for (const row of page.rows) {
      row.reporterLabel = label(row.reporterId);
      row.reportedUserLabel = label(row.reportedUserId);
    }
  }
  return { ...page, failedSources };
}
