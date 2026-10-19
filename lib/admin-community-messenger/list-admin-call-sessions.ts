/**
 * 통화 기록·강제 종료 화면 서버 로더 (설계 §3-3). Server-only.
 * 원천 = `community_messenger_call_sessions` — 대시보드 통화 지표(`load-chat-metrics`)와 같은 테이블·같은 경계 함수.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  CHAT_CALL_FAILED_REASON_PREFIX,
  chatActiveWindowFromIso,
  chatRiskWindowFromIso,
  chatStuckRingingBeforeIso,
} from "@/lib/admin/metrics/chat-metrics";
import {
  decodeAdminKeysetCursor,
  encodeAdminKeysetCursor,
  isAdminUuid,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import {
  ADMIN_CHAT_ACTIVE_CALLS_MAX,
  ADMIN_CHAT_CALLS_PAGE_SIZE,
  adminChatCallWindowMs,
  type AdminChatCallsQuery,
} from "@/lib/admin/chat-admin/admin-chat-calls-url-state";

export const ADMIN_FORCE_END_AUDIT_ACTION = "admin.force_end_call_session";

export type AdminChatCallRow = {
  id: string;
  roomId: string;
  roomTitle: string;
  chatDomain: string;
  sessionMode: string;
  callKind: string;
  status: string;
  endedReason: string;
  initiatorLabel: string;
  participantCount: number;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
};

export type AdminChatCallAuditRow = {
  id: string;
  createdAt: string;
  actorLabel: string;
  sessionId: string;
  roomId: string | null;
  reasonCode: string;
  note: string;
};

export type AdminChatCallsPage =
  | { tab: "active" | "records"; rows: AdminChatCallRow[]; nextCursor: string | null }
  | { tab: "audits"; rows: AdminChatCallAuditRow[]; nextCursor: string | null };

type Sb = ReturnType<typeof getSupabaseServer>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const quote = (v: string) => `"${v.replace(/"/g, "")}"`;

async function labelsFor(sb: Sb, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const { data } = await sb.from("profiles").select("id, nickname, username").in("id", uniq);
  for (const p of (data ?? []) as Array<{ id: string; nickname?: string | null; username?: string | null }>) {
    out.set(p.id, s(p.nickname) || s(p.username));
  }
  return out;
}

async function userIdsForSearch(sb: Sb, q: string): Promise<string[]> {
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .or(`nickname.ilike.*${q}*,username.ilike.*${q}*`)
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
}

async function listSessions(sb: Sb, query: AdminChatCallsQuery): Promise<AdminChatCallsPage> {
  const active = query.tab === "active";
  const asc = active; // 진행 중: 오래된(멈춘) 통화 먼저
  const limit = active ? ADMIN_CHAT_ACTIVE_CALLS_MAX : ADMIN_CHAT_CALLS_PAGE_SIZE;
  let rq = sb
    .from("community_messenger_call_sessions")
    .select("id, room_id, initiator_user_id, call_kind, status, session_mode, ended_reason, created_at, answered_at, ended_at, chat_domain")
    .order("created_at", { ascending: asc })
    .order("id", { ascending: asc })
    .limit(limit + 1);
  if (active) rq = rq.in("status", query.status === "ringing" || query.status === "active" ? [query.status] : ["ringing", "active"]);
  else if (query.status) rq = rq.eq("status", query.status);
  if (query.stuck) rq = rq.eq("status", "ringing").lt("created_at", chatStuckRingingBeforeIso());
  if (query.reason === "failed") rq = rq.like("ended_reason", `${CHAT_CALL_FAILED_REASON_PREFIX}%`);
  if (query.kind) rq = rq.eq("call_kind", query.kind);
  // 경계 = 대시보드와 같은 함수 (24h = 운영 위험 창, 7d = 마닐라 자정 기준 활동 창).
  if (query.activity === "7d") rq = rq.gte("created_at", chatActiveWindowFromIso());
  else if (query.window === "24h") rq = rq.gte("created_at", chatRiskWindowFromIso());
  else if (query.window) rq = rq.gte("created_at", new Date(Date.now() - adminChatCallWindowMs(query.window)).toISOString());
  if (query.q) {
    if (isAdminUuid(query.q)) {
      rq = rq.or(`room_id.eq.${query.q},initiator_user_id.eq.${query.q},recipient_user_id.eq.${query.q},id.eq.${query.q}`);
    } else {
      const ids = await userIdsForSearch(sb, query.q);
      if (!ids.length) return { tab: query.tab as "active" | "records", rows: [], nextCursor: null };
      rq = rq.or(`initiator_user_id.in.(${ids.join(",")}),recipient_user_id.in.(${ids.join(",")})`);
    }
  }
  const cursor = active ? null : decodeAdminKeysetCursor(query.cursor);
  if (cursor?.ts) {
    rq = rq.or(`created_at.lt.${quote(cursor.ts)},and(created_at.eq.${quote(cursor.ts)},id.lt.${cursor.id})`);
  }
  const { data, error } = await rq;
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Array<Record<string, unknown>>;
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    !active && all.length > limit && last ? encodeAdminKeysetCursor({ ts: s(last.created_at), id: s(last.id) }) : null;

  const sessionIds = page.map((r) => s(r.id));
  const roomIds = [...new Set(page.map((r) => s(r.room_id)).filter(Boolean))];
  const [labels, rooms, parts] = await Promise.all([
    labelsFor(sb, page.map((r) => s(r.initiator_user_id))),
    roomIds.length
      ? sb.from("community_messenger_rooms").select("id, title").in("id", roomIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title?: string | null }> }),
    sessionIds.length
      ? sb.from("community_messenger_call_session_participants").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as Array<{ session_id: string }> }),
  ]);
  const titleById = new Map(((rooms.data ?? []) as Array<{ id: string; title?: string | null }>).map((r) => [r.id, s(r.title)]));
  const partCount = new Map<string, number>();
  for (const p of (parts.data ?? []) as Array<{ session_id: string }>) {
    partCount.set(p.session_id, (partCount.get(p.session_id) ?? 0) + 1);
  }
  const rows = page.map<AdminChatCallRow>((r) => {
    const answered = s(r.answered_at) || null;
    const ended = s(r.ended_at) || null;
    const dur = answered && ended ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(answered)) / 1000)) : null;
    return {
      id: s(r.id),
      roomId: s(r.room_id),
      roomTitle: titleById.get(s(r.room_id)) ?? "",
      chatDomain: s(r.chat_domain),
      sessionMode: s(r.session_mode),
      callKind: s(r.call_kind),
      status: s(r.status),
      endedReason: s(r.ended_reason),
      initiatorLabel: labels.get(s(r.initiator_user_id)) ?? "",
      participantCount: partCount.get(s(r.id)) ?? 0,
      createdAt: s(r.created_at),
      answeredAt: answered,
      endedAt: ended,
      durationSeconds: Number.isFinite(dur as number) ? dur : null,
    };
  });
  return { tab: query.tab as "active" | "records", rows, nextCursor };
}

async function listForceEndAudits(sb: Sb, query: AdminChatCallsQuery): Promise<AdminChatCallsPage> {
  const limit = ADMIN_CHAT_CALLS_PAGE_SIZE;
  let rq = sb
    .from("audit_logs")
    .select("id, actor_id, target_id, before_json, after_json, created_at")
    .eq("action", ADMIN_FORCE_END_AUDIT_ACTION)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (query.window) rq = rq.gte("created_at", new Date(Date.now() - adminChatCallWindowMs(query.window)).toISOString());
  if (query.q && isAdminUuid(query.q)) rq = rq.or(`target_id.eq.${query.q},actor_id.eq.${query.q}`);
  const cursor = decodeAdminKeysetCursor(query.cursor);
  if (cursor?.ts) {
    rq = rq.or(`created_at.lt.${quote(cursor.ts)},and(created_at.eq.${quote(cursor.ts)},id.lt.${cursor.id})`);
  }
  const { data, error } = await rq;
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Array<Record<string, unknown>>;
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = all.length > limit && last ? encodeAdminKeysetCursor({ ts: s(last.created_at), id: s(last.id) }) : null;
  const labels = await labelsFor(sb, page.map((r) => s(r.actor_id)));
  const rows = page.map<AdminChatCallAuditRow>((r) => {
    const after = (r.after_json ?? {}) as Record<string, unknown>;
    const before = (r.before_json ?? {}) as Record<string, unknown>;
    return {
      id: s(r.id),
      createdAt: s(r.created_at),
      actorLabel: labels.get(s(r.actor_id)) ?? "",
      sessionId: s(r.target_id),
      roomId: s(after.roomId) || s(before.roomId) || null,
      reasonCode: s(after.reasonCode) || s(before.reasonCode),
      note: s(after.adminNote) || s(before.adminNote),
    };
  });
  return { tab: "audits", rows, nextCursor };
}

export async function listAdminChatCalls(query: AdminChatCallsQuery): Promise<AdminChatCallsPage> {
  const sb = getSupabaseServer();
  return query.tab === "audits" ? listForceEndAudits(sb, query) : listSessions(sb, query);
}
