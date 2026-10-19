/**
 * 통화 기록·강제 종료 화면 URL 상태 (설계 §3-3) — Client-safe pure module.
 * 대시보드 지표 링크(`chat-metrics.ts` `CHAT_CALL_LIST_PATH`)가 붙이는 파라미터를 그대로 읽는다:
 * `call_reason=failed&window=24h` · `call_status=ringing&stuck=1` · `call_status=<s>&activity=7d`.
 */
import { decodeAdminKeysetCursor, sanitizeAdminSearchTerm } from "@/lib/admin/chat-admin/admin-chat-list-url-state";

export const ADMIN_CHAT_CALL_TABS = ["active", "records", "audits"] as const;
export type AdminChatCallTab = (typeof ADMIN_CHAT_CALL_TABS)[number];

export const ADMIN_CHAT_CALL_STATUSES = [
  "ringing",
  "active",
  "ended",
  "missed",
  "rejected",
  "cancelled",
] as const;
export type AdminChatCallStatusFilter = (typeof ADMIN_CHAT_CALL_STATUSES)[number] | "";

export const ADMIN_CHAT_CALL_WINDOWS = ["24h", "7d", "30d"] as const;
export type AdminChatCallWindow = (typeof ADMIN_CHAT_CALL_WINDOWS)[number] | "";

export const ADMIN_CHAT_CALLS_PAGE_SIZE = 30;
/** 진행 중 탭은 페이지 없이 전체 (상한). */
export const ADMIN_CHAT_ACTIVE_CALLS_MAX = 100;

export type AdminChatCallsQuery = {
  tab: AdminChatCallTab;
  status: AdminChatCallStatusFilter;
  /** `failed` = ended_reason LIKE 'failed%' (대시보드 「통화 연결 실패」) */
  reason: "" | "failed";
  kind: "" | "voice" | "video";
  window: AdminChatCallWindow;
  /** 대시보드 「최근 7일」 경계 (마닐라 자정 기준) */
  activity: "" | "7d";
  /** 링 타임아웃 초과 ringing (대시보드 「수신 대기 정체」) */
  stuck: boolean;
  q: string;
  cursor: string;
};

type SearchLike = URLSearchParams | { get(name: string): string | null };

function pick<T extends string>(list: readonly T[], raw: string | null): T | "" {
  const v = String(raw ?? "").trim();
  return (list as readonly string[]).includes(v) ? (v as T) : "";
}

export function parseAdminChatCallsQuery(sp: SearchLike): AdminChatCallsQuery {
  const status = pick(ADMIN_CHAT_CALL_STATUSES, sp.get("call_status"));
  const stuck = sp.get("stuck") === "1";
  const reason = sp.get("call_reason") === "failed" ? "failed" : "";
  const tabRaw = pick(ADMIN_CHAT_CALL_TABS, sp.get("tab"));
  // 탭 생략 시: 정체·진행 상태 링크는 「진행 중」, 그 외는 「통화 기록」.
  const tab: AdminChatCallTab =
    tabRaw || (stuck || status === "ringing" || status === "active" ? "active" : reason || status ? "records" : "active");
  return {
    tab,
    status,
    reason,
    kind: sp.get("call_kind") === "voice" ? "voice" : sp.get("call_kind") === "video" ? "video" : "",
    window: pick(ADMIN_CHAT_CALL_WINDOWS, sp.get("window")),
    activity: sp.get("activity") === "7d" ? "7d" : "",
    stuck,
    q: sanitizeAdminSearchTerm(sp.get("q")),
    cursor: decodeAdminKeysetCursor(sp.get("cursor")) ? (sp.get("cursor") ?? "").trim() : "",
  };
}

/** URL 쿼리 (선두 `?` 포함). 기본값 생략. */
export function buildAdminChatCallsSearch(q: Partial<AdminChatCallsQuery>): string {
  const sp = new URLSearchParams();
  if (q.tab) sp.set("tab", q.tab);
  if (q.status) sp.set("call_status", q.status);
  if (q.reason) sp.set("call_reason", q.reason);
  if (q.kind) sp.set("call_kind", q.kind);
  if (q.window) sp.set("window", q.window);
  if (q.activity) sp.set("activity", q.activity);
  if (q.stuck) sp.set("stuck", "1");
  if (q.q) sp.set("q", q.q);
  if (q.cursor) sp.set("cursor", q.cursor);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function adminChatCallWindowMs(window: AdminChatCallWindow): number {
  return window === "24h" ? 24 * 3600_000 : window === "7d" ? 7 * 24 * 3600_000 : window === "30d" ? 30 * 24 * 3600_000 : 0;
}
