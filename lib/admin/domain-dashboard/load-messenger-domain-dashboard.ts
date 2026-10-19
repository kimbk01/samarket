/**
 * 채팅 대시보드 (`/admin/messenger`) — 지표는 `lib/admin/metrics/chat-metrics.ts` 단일 정의에서 읽는다 (설계 §6).
 * 전체 관제 Action Center 채팅 카드와 같은 지표 id·같은 처리 대기 레지스트리 값을 쓴다.
 * 값 확인 불가 = null (「확인 불가」, 0 표시 금지). 모든 지표는 같은 조건의 목록으로 이동한다.
 *
 * 방 수는 모두 CM `community_messenger_rooms.chat_domain` 기준 (거래 = chat_domain=trade, 레거시 product_chats 아님).
 * 구역: 지금 처리할 일(action) · 현재 상태(state: 방) · 도메인 상태(health: 통화 7일 + storage: 90일 미사용) ·
 * 문제(risk: 최근 24시간 푸시·통화 실패, 수신 대기 정체).
 * 읽기 전용 — 쓰기 없음.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import {
  CHAT_METRIC_DEFINITIONS,
  CHAT_REPORT_QUEUE_PATH,
  CHAT_ROOM_LIST_BASE,
  type ChatMetricDefinition,
  type ChatMetricId,
  type ChatMetricSection,
  type ChatMetricValue,
} from "@/lib/admin/metrics/chat-metrics";
import { loadChatMetrics } from "@/lib/admin/metrics/load-chat-metrics";
import type {
  AdminDomainActionItem,
  AdminDomainDashboardModel,
  AdminDomainMetric,
} from "@/lib/admin/domain-dashboard/types";

function sectionDefs(...sections: ChatMetricSection[]): ChatMetricDefinition[] {
  return CHAT_METRIC_DEFINITIONS.filter((d) => sections.includes(d.section));
}

function valueOf(values: ReadonlyMap<ChatMetricId, ChatMetricValue>, id: ChatMetricId): ChatMetricValue {
  return values.get(id) ?? { id, value: null, href: "", forbidden: false };
}

function sourceLabel(def: ChatMetricDefinition): string {
  const src =
    def.source.kind === "queue"
      ? `admin_action_queue.${def.source.categories.join("+")}`
      : def.source.description;
  return `metric:${def.id}|${src}|list:${def.listFilter}`;
}

function toActionItems(
  defs: ChatMetricDefinition[],
  values: ReadonlyMap<ChatMetricId, ChatMetricValue>
): AdminDomainActionItem[] {
  return defs
    .map((def) => ({ def, v: valueOf(values, def.id) }))
    .filter(({ v, def }) => !v.forbidden && (v.value === null || v.value > 0 || def.showWhenZero))
    .map(({ def, v }) => ({
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      count: v.value,
      href: v.href || def.href,
      source: sourceLabel(def),
      owner: def.source.kind === "queue" ? def.source.categories.join("+") : "chat_metrics",
    }));
}

function toMetrics(
  defs: ChatMetricDefinition[],
  values: ReadonlyMap<ChatMetricId, ChatMetricValue>
): AdminDomainMetric[] {
  return defs
    .map((def) => ({ def, v: valueOf(values, def.id) }))
    .filter(({ v }) => !v.forbidden)
    .map(({ def, v }) => ({
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      value: v.value,
      href: v.href || def.href,
      source: sourceLabel(def),
    }));
}

export async function loadMessengerDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sb = getSupabaseServer();
  const { values, sectionErrors } = await loadChatMetrics(sb);
  const sbAny = sb as any;

  const recent: AdminDomainDashboardModel["recent"] = [];
  try {
    const { data, error } = await sbAny
      .from("community_messenger_rooms")
      .select("id, title, chat_domain, last_message_at, room_status")
      .in("chat_domain", ["general_direct", "group"])
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) sectionErrors.push(`messenger_recent:${error.message}`);
    else {
      for (const row of data ?? []) {
        const domain = String(row.chat_domain ?? "");
        recent.push({
          id: String(row.id),
          title: String(row.title ?? row.id).slice(0, 80) || String(row.id),
          metaKo: `${domain} · ${String(row.room_status ?? "—")}`,
          metaEn: `${domain} · ${String(row.room_status ?? "—")}`,
          href: `/admin/chats/messenger?room=${encodeURIComponent(String(row.id))}`,
          at: row.last_message_at ? String(row.last_message_at) : null,
        });
      }
    }
  } catch (e) {
    sectionErrors.push(`messenger_recent:${e instanceof Error ? e.message : "error"}`);
  }

  return {
    domain: "messenger",
    titleKo: "채팅 대시보드",
    titleEn: "Chat dashboard",
    descriptionKo:
      "지금 처리할 일은 현재 대기 중인 신고·상담입니다. 운영 위험은 최근 24시간의 푸시·통화 실패와 링 타임아웃을 넘긴 통화, 방 상태는 최근 7일 활동 기준이며 90일 이상 미사용 방은 따로 표시합니다. 숫자를 누르면 같은 조건의 목록이 열립니다. 기간 기준: 마닐라 시간.",
    descriptionEn:
      "Work to do now = reports and support cases waiting right now. Operational risk covers push and call failures in the last 24 hours and calls stuck ringing. Room state uses the last 7 days of activity; rooms idle 90+ days are shown separately. Each number opens the list with the same filter. Period basis: Manila time.",
    currentState: toMetrics(sectionDefs("state"), values),
    actionRequired: toActionItems(sectionDefs("action"), values),
    domainHealth: toMetrics(sectionDefs("health", "storage"), values),
    issues: toActionItems(sectionDefs("risk"), values),
    primaryEntries: [
      {
        id: "reported",
        labelKo: "채팅 신고",
        labelEn: "Chat reports",
        href: CHAT_REPORT_QUEUE_PATH,
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "general",
        labelKo: "일반 1:1 채팅 목록",
        labelEn: "1:1 chats",
        href: CHAT_ROOM_LIST_BASE.general_direct,
        frequency: "FREQUENT",
      },
      {
        id: "group",
        labelKo: "그룹 채팅 목록",
        labelEn: "Group chats",
        href: CHAT_ROOM_LIST_BASE.group,
        frequency: "FREQUENT",
      },
      {
        id: "trade",
        labelKo: "거래 채팅 목록",
        labelEn: "Trade chats",
        href: CHAT_ROOM_LIST_BASE.trade,
        frequency: "FREQUENT",
      },
      {
        id: "order",
        labelKo: "배달 주문 채팅 목록",
        labelEn: "Store order chats",
        href: CHAT_ROOM_LIST_BASE.store_order,
        frequency: "FREQUENT",
      },
      {
        id: "advanced",
        labelKo: "메신저 고급 (통화 기록)",
        labelEn: "Messenger advanced (call log)",
        href: "/admin/chats/messenger",
        frequency: "OCCASIONAL",
      },
      {
        // 프로세스 메모리 지표 — 대시보드 근거로 쓰지 않는다 (설계 C-12). 진입만 유지.
        id: "perf",
        labelKo: "메신저 성능",
        labelEn: "Messenger performance",
        href: "/admin/chats/messenger-performance",
        frequency: "OCCASIONAL",
      },
    ],
    contextEntries: [
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: "/admin/support?tab=ACTIONABLE",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "action_center",
        labelKo: "전체 처리 대기",
        labelEn: "All pending work",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "push_devices",
        labelKo: "푸시 기기·발송 기록",
        labelEn: "Push devices & deliveries",
        href: "/admin/push-devices",
        frequency: "OCCASIONAL",
      },
      {
        id: "notifications",
        labelKo: "알림",
        labelEn: "Notifications",
        href: "/admin/notifications",
        frequency: "OCCASIONAL",
      },
      {
        id: "reset",
        labelKo: "테스트 채팅 데이터 정리",
        labelEn: "Clean test chat data",
        href: buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.chat),
        frequency: "CONFIGURATION",
      },
    ],
    recent,
    sectionErrors,
  };
}
