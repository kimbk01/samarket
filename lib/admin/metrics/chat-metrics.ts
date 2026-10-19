/**
 * 채팅 지표 정의 (채팅 Admin 설계 §6 · docs/admin/dibay-admin-chat-audit-design.md) — 지표 id 단일 정의.
 *
 * - 채팅 대시보드(`/admin/messenger`)와 전체 관제 Action Center 채팅 카드가 **같은 정의**를 읽는다.
 *   표시 중복은 허용, 정의 중복은 금지 (배달 `delivery-metrics.ts` 와 같은 원칙).
 * - 값을 확인할 수 없으면 `null` → 화면은 「확인 불가」 (0 표시 금지).
 * - 현재 처리 업무(지금·최근 기간)와 누적·장기 위험을 기간으로 분리한다:
 *   `now`(지금 대기) · `last_24h`(운영 위험, 롤링 24시간) · `active_window`(최근 7일, 마닐라 자정 기준) ·
 *   `stale`(링 타임아웃 초과로 남은 상태) · `idle_90d`(90일 이상 미사용, 마닐라 자정 기준).
 * - 모든 지표는 같은 조건의 목록(`href`)으로 이동한다. `listFilter` 가 그 목록이 필터를 실제로 읽는지 밝힌다.
 *
 * URL 파라미터 이름 (채팅 목록 화면과 합의): `domain`, `status`, `activity=7d`, `idle=90`, 신고 큐 `status=open&type=`.
 *
 * 클라이언트 안전 — 서버 전용 모듈 import 금지.
 */

import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type {
  AdminActionQueueCategory,
  AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import { manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";

// ── 기간·조건 단일 정의 (로더와 목록 화면이 같은 경계를 쓴다) ────────────────────

/** 활성 기간 = 최근 7일 (마닐라 오늘 포함 7일, 주문 목록 `last_7_days` 와 같은 경계). */
export const CHAT_ACTIVE_WINDOW_DAYS = 7;
/** 장기 미사용 기준 일수 — 목록 `?idle=90`. */
export const CHAT_ROOM_IDLE_DAYS = 90;
/** 운영 위험 롤링 창 (시간). */
export const CHAT_RISK_WINDOW_HOURS = 24;
/**
 * 「수신 대기 정체」 기준 — 관리자가 설정할 수 있는 링 타임아웃 최대값(600초,
 * `clampIncomingRingTimeoutSeconds`)을 넘긴 ringing 세션. 정책 값과 무관하게 확실히 끝났어야 하는 세션만 센다.
 */
export const CHAT_CALL_STUCK_RINGING_SECONDS = 600;

/** 열린(관리자 처리 대기) 신고 상태 — 출처 테이블별. */
export const CHAT_REPORT_OPEN_STATUSES = {
  /** community_messenger_reports (처리 대기 레지스트리 `messenger_actionable` 과 동일) */
  messenger: ["received", "reviewing"],
  /** 레거시 거래 채팅 신고 `chat_reports` (`ChatReportStatus`) */
  trade_chat: ["received", "triaging", "escalated"],
  /** 거래 신고 `reports.target_type=chat_room` (`TRADE_REPORT_ADMIN_ACTIONABLE`) */
  trade_report: ["pending", "reviewing"],
} as const;

export type ChatReportType = keyof typeof CHAT_REPORT_OPEN_STATUSES;

/** 채팅 푸시 이벤트 그룹 — `notification_deliveries.event_type`. prefix 는 `like 'prefix%'`. */
export const CHAT_PUSH_EVENT_GROUPS = {
  general: { eventTypes: ["chat_message"], prefix: null },
  group: { eventTypes: ["group_message"], prefix: null },
  trade: { eventTypes: ["trade_message"], prefix: null },
  store_order: { eventTypes: ["store_order_message"], prefix: null },
  support: { eventTypes: [], prefix: "support_" },
} as const satisfies Record<string, { eventTypes: readonly string[]; prefix: string | null }>;

export type ChatPushEventGroup = keyof typeof CHAT_PUSH_EVENT_GROUPS;
export const CHAT_PUSH_EVENT_GROUP_KEYS = Object.keys(CHAT_PUSH_EVENT_GROUPS) as ChatPushEventGroup[];

/** 통화 실패 = `community_messenger_call_sessions.ended_reason like 'failed%'` (failed_ice·failed_media 등). */
export const CHAT_CALL_FAILED_REASON_PREFIX = "failed";

/** 최근 7일 통화 표시 상태 (종료·부재중·거절·취소). */
export const CHAT_CALL_STATUSES_7D = ["ended", "missed", "rejected", "cancelled"] as const;
export type ChatCallStatus7d = (typeof CHAT_CALL_STATUSES_7D)[number];

export const CHAT_ROOM_STATE_KEYS = ["active_7d", "archived", "blocked"] as const;
export type ChatRoomStateKey = (typeof CHAT_ROOM_STATE_KEYS)[number];

const DAY_MS = 86_400_000;

/** 최근 7일 시작 (마닐라 자정, UTC ISO). */
export function chatActiveWindowFromIso(now: Date = new Date()): string {
  const todayFrom = Date.parse(manilaTodayRangeUtc(now).fromIso);
  return new Date(todayFrom - (CHAT_ACTIVE_WINDOW_DAYS - 1) * DAY_MS).toISOString();
}

/** 장기 미사용 기준 시각 (마닐라 오늘 자정 − 90일). `last_message_at`(NOT NULL, 기본 생성 시각)이 이보다 이전이면 미사용. */
export function chatIdleCutoffIso(now: Date = new Date(), days: number = CHAT_ROOM_IDLE_DAYS): string {
  const todayFrom = Date.parse(manilaTodayRangeUtc(now).fromIso);
  return new Date(todayFrom - days * DAY_MS).toISOString();
}

/** 운영 위험 창 시작 (롤링 24시간). */
export function chatRiskWindowFromIso(now: Date = new Date()): string {
  return new Date(now.getTime() - CHAT_RISK_WINDOW_HOURS * 3_600_000).toISOString();
}

/** 수신 대기 정체 기준 시각 — 이 시각 이전에 생성되어 아직 ringing 이면 정체. */
export function chatStuckRingingBeforeIso(now: Date = new Date()): string {
  return new Date(now.getTime() - CHAT_CALL_STUCK_RINGING_SECONDS * 1000).toISOString();
}

// ── 이동 화면 ────────────────────────────────────────────────────────────

/** 유형별 채팅방 목록 화면 (채팅 목록 화면이 `domain`/`status`/`activity`/`idle` 을 읽는다). */
export const CHAT_ROOM_LIST_BASE: Record<ChatDomain, string> = {
  general_direct: "/admin/chats/general",
  group: "/admin/chats/group",
  // CM trade 방 기준 (레거시 product_chats 아님) — 목록 화면도 같은 기준으로 전환 중
  trade: "/admin/chats/trade",
  store_order: "/admin/order-chats",
};

export const CHAT_REPORT_QUEUE_PATH = "/admin/chats/reported" as const;
/** 채팅 카드 CTA — 채팅 대시보드 (신고 큐 단독 아님). */
export const CHAT_DASHBOARD_HREF = "/admin/messenger" as const;

function withQuery(base: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

export function chatRoomListHref(
  domain: ChatDomain,
  filter: { status?: string; activity?: "7d"; idle?: number } = {}
): string {
  const params: Record<string, string> = { domain };
  if (filter.status) params.status = filter.status;
  if (filter.activity) params.activity = filter.activity;
  if (filter.idle) params.idle = String(filter.idle);
  return withQuery(CHAT_ROOM_LIST_BASE[domain], params);
}

export function chatReportQueueHref(type: ChatReportType): string {
  return withQuery(CHAT_REPORT_QUEUE_PATH, { status: "open", type });
}

/**
 * 통화 기록 — 전용 필터 목록이 아직 없다. 가장 가까운 화면(메신저 고급의 통화 기록)으로 이동하며,
 * 필터 파라미터는 목록이 생기면 그대로 읽도록 미리 붙인다 (`listFilter: "pending"`).
 */
export const CHAT_CALL_LIST_PATH = "/admin/chats/messenger" as const;
/**
 * 푸시 발송 실패 — 전용 목록이 아직 없다 (설계 §6 「푸시 실패 목록 (신설 필요)」).
 * 가장 가까운 화면은 이용자별 기기·발송 기록 (`listFilter: "pending"`).
 */
export const CHAT_PUSH_FAILURE_LIST_PATH = "/admin/push-devices" as const;

// ── 지표 정의 ────────────────────────────────────────────────────────────

export type ChatMetricId =
  | `chat.reports_open.${ChatReportType}`
  | "chat.support_waiting_admin"
  | `chat.push_failed_24h.${ChatPushEventGroup}`
  | "chat.call_failed_24h"
  | "chat.call_stuck_ringing"
  | `chat.rooms.${ChatDomain}.${ChatRoomStateKey}`
  | `chat.calls_7d.${ChatCallStatus7d}`
  | `chat.rooms_idle_90d.${ChatDomain}`;

/** 값 출처 — 처리 대기 레지스트리(Bell 과 같은 값) 또는 서버 로더의 직접 집계. */
export type ChatMetricSource =
  | { kind: "queue"; categories: readonly AdminActionQueueCategory[] }
  | { kind: "direct"; description: string };

/**
 * action = 지금 처리할 일 · risk = 운영 위험(최근 24시간·정체) · state = 현재 상태(방) ·
 * health = 현재 상태(통화 7일) · storage = 장기·저장.
 */
export type ChatMetricSection = "action" | "risk" | "state" | "health" | "storage";

/**
 * applied = 대상 화면이 이 필터를 지금 읽는다 · coordinated = 채팅 목록 화면이 합의된 파라미터로 읽도록 전환 중 ·
 * pending = 전용 필터 목록이 없어 가장 가까운 화면으로 이동 (목록 신설 필요).
 */
export type ChatMetricListFilter = "applied" | "coordinated" | "pending";

export type ChatMetricDefinition = {
  id: ChatMetricId;
  labelKo: string;
  labelEn: string;
  section: ChatMetricSection;
  source: ChatMetricSource;
  period: "now" | "last_24h" | "active_window" | "stale" | "idle_90d";
  /** null = 활성 관리자 누구나 */
  permission: AdminPermissionKey | null;
  href: string;
  listFilter: ChatMetricListFilter;
  /** 0 이어도 표시할지 */
  showWhenZero: boolean;
};

const DOMAIN_LABEL: Record<ChatDomain, { ko: string; en: string }> = {
  general_direct: { ko: "일반 1:1", en: "1:1" },
  group: { ko: "그룹", en: "Group" },
  trade: { ko: "거래", en: "Trade" },
  store_order: { ko: "배달 주문", en: "Store order" },
};

const REPORT_LABEL: Record<ChatReportType, { ko: string; en: string; source: ChatMetricSource }> = {
  messenger: {
    ko: "채팅 신고 · 메신저",
    en: "Chat reports · Messenger",
    source: { kind: "queue", categories: ["messenger_actionable"] },
  },
  trade_chat: {
    ko: "채팅 신고 · 거래 채팅 (레거시)",
    en: "Chat reports · Trade chat (legacy)",
    source: { kind: "direct", description: "chat_reports.status ∈ received|triaging|escalated" },
  },
  trade_report: {
    ko: "채팅 신고 · 거래 채팅방 신고",
    en: "Chat reports · Trade chat room",
    source: { kind: "direct", description: "reports.target_type=chat_room, status ∈ pending|reviewing" },
  },
};

const PUSH_LABEL: Record<ChatPushEventGroup, { ko: string; en: string }> = {
  general: { ko: "일반 1:1", en: "1:1" },
  group: { ko: "그룹", en: "Group" },
  trade: { ko: "거래", en: "Trade" },
  store_order: { ko: "배달 주문", en: "Store order" },
  support: { ko: "고객센터", en: "Support" },
};

const CALL_STATUS_LABEL: Record<ChatCallStatus7d, { ko: string; en: string }> = {
  ended: { ko: "종료", en: "Ended" },
  missed: { ko: "부재중", en: "Missed" },
  rejected: { ko: "거절", en: "Rejected" },
  cancelled: { ko: "취소", en: "Cancelled" },
};

const ROOM_STATE_LABEL: Record<ChatRoomStateKey, { ko: string; en: string }> = {
  active_7d: { ko: "활성 (최근 7일)", en: "Active (last 7 days)" },
  archived: { ko: "보관", en: "Archived" },
  blocked: { ko: "정지", en: "Blocked" },
};

function pushSourceDescription(group: ChatPushEventGroup): string {
  const g = CHAT_PUSH_EVENT_GROUPS[group];
  const types = g.prefix ? `${g.prefix}*` : g.eventTypes.join("|");
  return `notification_deliveries.status=failed, event_type ∈ ${types}, created ∈ last 24h`;
}

function roomStateFilter(state: ChatRoomStateKey): { status: string; activity?: "7d" } {
  return state === "active_7d" ? { status: "active", activity: "7d" } : { status: state };
}

export const CHAT_METRIC_DEFINITIONS: readonly ChatMetricDefinition[] = [
  // ── 지금 처리할 일 ──────────────────────────────────────────────────────
  ...(Object.keys(CHAT_REPORT_OPEN_STATUSES) as ChatReportType[]).map(
    (type): ChatMetricDefinition => ({
      id: `chat.reports_open.${type}`,
      labelKo: REPORT_LABEL[type].ko,
      labelEn: REPORT_LABEL[type].en,
      section: "action",
      source: REPORT_LABEL[type].source,
      period: "now",
      permission: null,
      href: chatReportQueueHref(type),
      listFilter: "coordinated",
      showWhenZero: true,
    })
  ),
  {
    id: "chat.support_waiting_admin",
    labelKo: "고객센터 답변 대기",
    labelEn: "Support waiting on admin",
    section: "action",
    source: { kind: "queue", categories: ["support_actionable"] },
    period: "now",
    permission: null,
    href: "/admin/support?tab=ACTIONABLE",
    listFilter: "applied",
    showWhenZero: true,
  },
  // `chat.rooms_blocked_review` (정지 후 검토 필요) — 방에 검토 신호 컬럼이 없어 정의하지 않는다.
  // 정지 방 수는 현재 상태(`chat.rooms.*.blocked`)에 표시한다.

  // ── 운영 위험 (최근 24시간 · 정체) ─────────────────────────────────────────
  ...CHAT_PUSH_EVENT_GROUP_KEYS.map(
    (group): ChatMetricDefinition => ({
      id: `chat.push_failed_24h.${group}`,
      labelKo: `푸시 발송 실패 · ${PUSH_LABEL[group].ko} (24시간)`,
      labelEn: `Push failures · ${PUSH_LABEL[group].en} (24h)`,
      section: "risk",
      source: { kind: "direct", description: pushSourceDescription(group) },
      period: "last_24h",
      permission: null,
      // 목록 신설 필요 — 가장 가까운 화면 (이용자별 발송 기록)
      href: withQuery(CHAT_PUSH_FAILURE_LIST_PATH, { status: "failed", event: group, window: "24h" }),
      listFilter: "pending",
      showWhenZero: false,
    })
  ),
  {
    id: "chat.call_failed_24h",
    labelKo: "통화 연결 실패 (24시간)",
    labelEn: "Failed calls (24h)",
    section: "risk",
    source: {
      kind: "direct",
      description: "community_messenger_call_sessions.ended_reason like 'failed%', created ∈ last 24h",
    },
    period: "last_24h",
    permission: null,
    // 통화 기록 필터 목록 신설 필요 — 가장 가까운 화면
    href: withQuery(CHAT_CALL_LIST_PATH, { call_reason: CHAT_CALL_FAILED_REASON_PREFIX, window: "24h" }),
    listFilter: "pending",
    showWhenZero: false,
  },
  {
    id: "chat.call_stuck_ringing",
    labelKo: "수신 대기 정체 통화 (링 타임아웃 초과)",
    labelEn: "Calls stuck ringing (past ring timeout)",
    section: "risk",
    source: {
      kind: "direct",
      description: `community_messenger_call_sessions.status=ringing, created > ${CHAT_CALL_STUCK_RINGING_SECONDS}s ago`,
    },
    period: "stale",
    permission: null,
    // 통화 기록 필터 목록 신설 필요 — 가장 가까운 화면
    href: withQuery(CHAT_CALL_LIST_PATH, { call_status: "ringing", stuck: "1" }),
    listFilter: "pending",
    showWhenZero: false,
  },

  // ── 현재 상태: 유형별 방 ───────────────────────────────────────────────────
  ...CHAT_DOMAINS.flatMap((domain) =>
    CHAT_ROOM_STATE_KEYS.map(
      (state): ChatMetricDefinition => ({
        id: `chat.rooms.${domain}.${state}`,
        labelKo: `${DOMAIN_LABEL[domain].ko} · ${ROOM_STATE_LABEL[state].ko}`,
        labelEn: `${DOMAIN_LABEL[domain].en} · ${ROOM_STATE_LABEL[state].en}`,
        section: "state",
        source: {
          kind: "direct",
          description:
            state === "active_7d"
              ? `community_messenger_rooms.chat_domain=${domain}, room_status=active, last_message_at ∈ last 7 days (Manila), not deleted`
              : `community_messenger_rooms.chat_domain=${domain}, room_status=${state}, not deleted`,
        },
        period: state === "active_7d" ? "active_window" : "now",
        permission: null,
        href: chatRoomListHref(domain, roomStateFilter(state)),
        listFilter: "coordinated",
        showWhenZero: true,
      })
    )
  ),

  // ── 현재 상태: 통화 (최근 7일) ─────────────────────────────────────────────
  ...CHAT_CALL_STATUSES_7D.map(
    (status): ChatMetricDefinition => ({
      id: `chat.calls_7d.${status}`,
      labelKo: `통화 ${CALL_STATUS_LABEL[status].ko} (최근 7일)`,
      labelEn: `Calls ${CALL_STATUS_LABEL[status].en} (last 7 days)`,
      section: "health",
      source: {
        kind: "direct",
        description: `community_messenger_call_sessions.status=${status}, created ∈ last 7 days (Manila)`,
      },
      period: "active_window",
      permission: null,
      // 통화 기록 필터 목록 신설 필요 — 가장 가까운 화면
      href: withQuery(CHAT_CALL_LIST_PATH, { call_status: status, activity: "7d" }),
      listFilter: "pending",
      showWhenZero: true,
    })
  ),

  // ── 장기·저장: 90일 이상 미사용 방 ─────────────────────────────────────────
  ...CHAT_DOMAINS.map(
    (domain): ChatMetricDefinition => ({
      id: `chat.rooms_idle_90d.${domain}`,
      labelKo: `장기 미사용 방 · ${DOMAIN_LABEL[domain].ko} (${CHAT_ROOM_IDLE_DAYS}일 이상)`,
      labelEn: `Idle rooms · ${DOMAIN_LABEL[domain].en} (${CHAT_ROOM_IDLE_DAYS}+ days)`,
      section: "storage",
      source: {
        kind: "direct",
        description: `community_messenger_rooms.chat_domain=${domain}, last_message_at < Manila today − ${CHAT_ROOM_IDLE_DAYS}d, not deleted`,
      },
      period: "idle_90d",
      permission: null,
      href: chatRoomListHref(domain, { idle: CHAT_ROOM_IDLE_DAYS }),
      listFilter: "coordinated",
      showWhenZero: true,
    })
  ),
];

export const CHAT_METRIC_BY_ID: ReadonlyMap<ChatMetricId, ChatMetricDefinition> = new Map(
  CHAT_METRIC_DEFINITIONS.map((d) => [d.id, d])
);

export function getChatMetricDefinition(id: ChatMetricId): ChatMetricDefinition {
  const d = CHAT_METRIC_BY_ID.get(id);
  if (!d) throw new Error(`unknown_chat_metric:${id}`);
  return d;
}

/**
 * 전체 관제 Action Center 「채팅」 카드 구성 지표 — 대시보드와 같은 id.
 * 클라이언트 카드는 Bell 페이로드(처리 대기 레지스트리)만 읽을 수 있어 queue 출처 지표만 넣는다.
 * (고객센터 대기는 Action Center 공통 운영 카드가 따로 보여 주므로 중복 합산하지 않는다.)
 */
export const CHAT_ACTION_CENTER_CARD_METRIC_IDS = [
  "chat.reports_open.messenger",
] as const satisfies readonly ChatMetricId[];

export type ChatMetricValue = {
  id: ChatMetricId;
  /** null = 확인 불가 (0 아님) */
  value: number | null;
  href: string;
  /** 권한 범위 밖 — 표시하지 않는다 */
  forbidden: boolean;
};

/** 처리 대기 레지스트리 결과 → 지표 값. 하나라도 ok 가 아니면 null (권한 없음은 forbidden). */
export function resolveChatQueueMetric(
  def: ChatMetricDefinition,
  categories: readonly AdminActionQueueCategoryResult[] | null | undefined
): ChatMetricValue {
  if (def.source.kind !== "queue") {
    return { id: def.id, value: null, href: def.href, forbidden: false };
  }
  const list = categories ?? [];
  let sum = 0;
  let forbidden = false;
  let unavailable = list.length === 0;
  for (const key of def.source.categories) {
    const hit = list.find((c) => c.key === key);
    if (!hit) {
      unavailable = true;
      continue;
    }
    if (hit.status === "forbidden") {
      forbidden = true;
      continue;
    }
    if (hit.status !== "ok" || hit.count == null || !Number.isFinite(hit.count)) {
      unavailable = true;
      continue;
    }
    sum += hit.count;
  }
  return { id: def.id, value: forbidden || unavailable ? null : sum, href: def.href, forbidden };
}

/** 직접 집계 값(서버 로더) → 지표 값. 음수·비숫자 = null. */
export function resolveChatDirectMetric(def: ChatMetricDefinition, raw: number | null | undefined): ChatMetricValue {
  const ok = typeof raw === "number" && Number.isFinite(raw) && raw >= 0;
  return { id: def.id, value: ok ? Math.floor(raw as number) : null, href: def.href, forbidden: false };
}

export type ChatActionCenterCardValue = {
  href: typeof CHAT_DASHBOARD_HREF;
  /** null = 구성 지표 중 하나라도 확인 불가 */
  count: number | null;
  unavailable: boolean;
};

/** Action Center 채팅 카드 — 대시보드와 같은 지표 정의로 합산, CTA = 채팅 대시보드. */
export function resolveChatActionCenterCard(
  categories: readonly AdminActionQueueCategoryResult[] | null | undefined
): ChatActionCenterCardValue {
  let sum = 0;
  let unavailable = false;
  for (const id of CHAT_ACTION_CENTER_CARD_METRIC_IDS) {
    const v = resolveChatQueueMetric(getChatMetricDefinition(id), categories);
    if (v.forbidden) continue;
    if (v.value == null) {
      unavailable = true;
      continue;
    }
    sum += v.value;
  }
  return { href: CHAT_DASHBOARD_HREF, count: unavailable ? null : sum, unavailable };
}

/** 지표 값 표시 — null 은 「확인 불가」 (0 표시 금지). */
export function formatChatMetricValue(value: number | null | undefined, ko: boolean): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ko ? "확인 불가" : "Unavailable";
  return Math.round(value).toLocaleString();
}
