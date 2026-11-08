"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BOARD_LABEL, parseCustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { adminOperatorRowClassFromNotificationStatus } from "@/lib/admin/admin-operator-row-presentation";
import { eventEditHref } from "@/lib/admin/promotion-ownership-visibility";
import {
  CAMPAIGN_ARCHIVABLE_STATUSES,
  CAMPAIGN_TAB_LABEL_KEY,
  CAMPAIGN_TAB_STATUSES,
  campaignListQueryToSearchParams,
  campaignStatusLabel,
  parseCampaignListQuery,
  type CampaignListQuery,
  type CampaignListTab,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { isInboxDetailDestinationPayload } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { campaignCreateErrorMessage } from "@/lib/admin/notification-campaigns/campaign-create-form";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AppReleaseNoticesPanel,
  Modal,
  OwnerNoticesPanel,
  RecipientsModal,
  RepeatModal,
  ResendModal,
  SENT_KIND_LABEL,
  SentResultBadge,
  SoundModal,
  type MemberStats,
  type ModalDone,
  type SentKind,
  type SentRecurrence,
  type SentRowLite,
} from "@/components/admin/notifications/AdminSentNotificationPanels";
import { AdminNotificationCampaignCreatePage } from "@/components/admin/notifications/AdminNotificationCampaignCreatePage";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import { campaignListKindOf } from "@/lib/admin/notification-campaigns/campaign-list-kind";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

type LatestOccurrence = {
  id?: string;
  status?: string;
  trigger_type?: string;
  scheduled_for?: string | null;
  completed_at?: string | null;
  push_sent?: number;
  push_failed?: number;
  push_device_count?: number;
  in_app_sent?: number;
  in_app_member_count?: number;
  target_member_count?: number;
};

type CampaignRow = {
  id: string;
  title: string;
  body?: string | null;
  type: string;
  target_type: string;
  channel?: string;
  status: string;
  effective_status?: string;
  send_mode?: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
  archived_at?: string | null;
  deeplink_url?: string | null;
  latest_occurrence?: LatestOccurrence | null;
  opened?: { push: number; in_app: number; capped?: boolean } | null;
  member_stats?: MemberStats | null;
  target_payload?: unknown;
  recurrence_kind?: string | null;
  recurrence_time?: string | null;
  recurrence_weekday?: number | null;
  recurrence_start_at?: string | null;
  recurrence_end_at?: string | null;
  resend_of_at?: string | null;
};

/** 분류 — 보낼 때 고른 분류(없는 과거 발송은 이벤트 연결 여부). 서버 목록 조건과 같은 함수. */
function kindOf(row: CampaignRow): SentKind {
  return campaignListKindOf(row);
}

function recurrenceOf(row: CampaignRow): SentRecurrence | null {
  const status = row.effective_status ?? row.status;
  if (row.send_mode !== "recurring" || !["active", "paused"].includes(status)) return null;
  const k = row.recurrence_kind;
  if (k !== "daily" && k !== "weekly" && k !== "monthly") return null;
  return {
    kind: k,
    time: String(row.recurrence_time ?? "09:00").slice(0, 5),
    weekday: typeof row.recurrence_weekday === "number" ? row.recurrence_weekday : null,
    startAt: row.recurrence_start_at ?? null,
    endAt: row.recurrence_end_at ?? null,
  };
}

const WEEKDAY_KEYS: readonly MessageKey[] = ["admin_notifications_weekday_sun", "admin_notifications_weekday_mon", "admin_notifications_weekday_tue", "admin_notifications_weekday_wed", "admin_notifications_weekday_thu", "admin_notifications_weekday_fri", "admin_notifications_weekday_sat"];
const REPEAT_KIND_KEY: Record<string, MessageKey> = {
  daily: "admin_notifications_repeat_daily",
  weekly: "admin_notifications_repeat_weekly",
  monthly: "admin_notifications_repeat_monthly",
};

type KindTab = "all" | SentKind | "update" | "owner";
/** 분류 탭 — 보내는 알림 5종 + 자동 「업데이트 내역」·「매장 알림」(사장님 자동 알림 결과 · 재감사 2026-11-02 S3). */
const KIND_TABS: readonly KindTab[] = ["all", "notice", "system", "event", "marketing", "update", "owner"];

type NoticeLite = { id: string; title: string; content_type?: string | null };

function readLinkedContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

/** 목록 「보낸 시각」(시안 v3 MM-DD HH:mm) — 올해 알림만 연도를 뺀다. 원본 문자열 = formatAdminManilaDateTime(SSOT). */
function shortManilaTime(label: string): string {
  const m = /^(\d{4})-(\d{2}-\d{2} \d{2}:\d{2})(.*)$/.exec(label);
  if (!m) return label;
  const thisYear = formatAdminManilaDateTime(new Date().toISOString()).slice(0, 4);
  return m[1] === thisYear ? `${m[2]}${m[3]}` : label;
}

function readResendOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const v = (payload as Record<string, unknown>).resend_of;
  return typeof v === "string" ? v.trim() : "";
}

/** Platform Event source identity (Event Dist Push/Bell) — not app-notice content_id. */
export function readLinkedPlatformEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.platform_event_id === "string") return p.platform_event_id.trim();
  return "";
}

/** 알림 발송 v3 목록 탭 — 보낸 알림이 기본. 테스트(sandbox)는 목록에서 뺀다. */
const LIST_TABS: readonly CampaignListTab[] = ["completed", "in_progress", "drafting", "archived"];

const TARGET_LABEL: Record<string, { ko: string; en: string }> = {
  all: catalogPair("admin_notif_target_all"),
  marketing_opt_in: catalogPair("admin_opted_in"),
  selected_users: catalogPair("admin_specific_members"),
  active_users: catalogPair("admin_active_30d"),
  region: catalogPair("admin_ops_console_group_region"),
};

function isArchivable(row: CampaignRow): boolean {
  return (CAMPAIGN_ARCHIVABLE_STATUSES as readonly string[]).includes(row.status) && !row.archived_at;
}

/**
 * 알림 목록 (v3 · 2026-10-30) — 보낸 알림 이력 · 발송 중·예약 · 초안 · 삭제한 알림.
 * 열: 시각 · 제목 · 누르면 열리는 화면 · 받는 사람 · 결과(알림함·푸시) · 열람 · 상태 · 작업.
 * 「삭제」 = 목록에서 지우기(보관 · archived_at) — 회원 알림함에 이미 간 알림은 남고, 「삭제한 알림」에서 되돌린다.
 */
export function AdminNotificationCampaignsPage() {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const ko = lang !== "en";
  const tx = (key: MessageKey, vars?: Record<string, unknown>) => translateBy(lang, key, vars);
  const router = useRouter();
  const sendAction = useAdminRouteAction("/admin/notifications");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ADM-05: tab · filters · page live in the URL (shareable, back/forward safe).
  const query = useMemo(
    () => parseCampaignListQuery(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams]
  );
  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [total, setTotal] = useState(0);
  const [noticeMap, setNoticeMap] = useState<Record<string, NoticeLite>>({});
  const [eventTitleMap, setEventTitleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [kindCounts, setKindCounts] = useState<Partial<Record<KindTab, number>>>({});
  const [updateCount, setUpdateCount] = useState<number | null>(null);
  const [recipientsRow, setRecipientsRow] = useState<SentRowLite | null>(null);
  const [resendTarget, setResendTarget] = useState<{ row: SentRowLite; mode: "same" | "failed" | "unread" } | null>(null);
  const [repeatRow, setRepeatRow] = useState<SentRowLite | null>(null);
  const [soundKind, setSoundKind] = useState<SentKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tabCounts, setTabCounts] = useState<Partial<Record<CampaignListTab, number>>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [soundReload, setSoundReload] = useState(0);

  // 안내(토스트)는 잠시 보이고 사라진다(시안 v3).
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);
  const viewParam = searchParams?.get("view");
  const view: KindTab = viewParam === "update" ? "update" : viewParam === "owner" ? "owner" : (query.type ?? "all");

  // 업데이트 내역 탭 숫자 — 처음부터 보이게(버전 수).
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/notification-campaigns/app-release-notices", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; releases?: unknown[] }) => {
        if (!cancelled && j.ok && Array.isArray(j.releases)) setUpdateCount(j.releases.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setQDraft(query.q ?? "");
  }, [query.q]);

  const pushQuery = useCallback(
    (next: Partial<CampaignListQuery>, opts?: { keepPage?: boolean }) => {
      const merged: CampaignListQuery = { ...query, ...next, ...(opts?.keepPage ? {} : { page: next.page ?? 1 }) };
      const sp = campaignListQueryToSearchParams(merged).toString();
      router.replace(sp ? `${pathname}?${sp}` : pathname, { scroll: false });
    },
    [query, router, pathname]
  );

  // 열리는 화면 이름 — 고객센터 글·이벤트 제목 (없어도 목록은 동작)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nr, er] = await Promise.all([
          fetch("/api/admin/app-notices", { credentials: "include" }),
          fetch("/api/admin/platform-events", { credentials: "include" }),
        ]);
        const nj = (await nr.json().catch(() => ({}))) as { ok?: boolean; notices?: NoticeLite[] };
        const ej = (await er.json().catch(() => ({}))) as { ok?: boolean; events?: Array<{ id?: string; title?: string }> };
        if (cancelled) return;
        if (nr.ok && nj.ok && Array.isArray(nj.notices)) {
          const map: Record<string, NoticeLite> = {};
          for (const n of nj.notices) if (n?.id) map[n.id] = n;
          setNoticeMap(map);
        }
        if (er.ok && ej.ok && Array.isArray(ej.events)) {
          const map: Record<string, string> = {};
          for (const ev of ej.events) if (ev?.id && ev.title) map[ev.id] = ev.title;
          setEventTitleMap(map);
        }
      } catch {
        /* optional join */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apiQueryString = campaignListQueryToSearchParams(query).toString();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/admin/notification-campaigns?${apiQueryString}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: CampaignRow[];
        total?: number;
        error?: string;
        kind_counts?: Partial<Record<KindTab, number>>;
        tab_counts?: Partial<Record<CampaignListTab, number>>;
      };
      if (!res.ok || !j?.ok) {
        setErr({ code: typeof j?.error === "string" ? j.error : "load_failed", httpStatus: res.status });
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(j.campaigns ?? []);
      setTotal(typeof j.total === "number" ? j.total : (j.campaigns ?? []).length);
      if (j.kind_counts) setKindCounts(j.kind_counts);
      if (j.tab_counts) setTabCounts(j.tab_counts);
    } catch {
      setErr({ code: "network_error" });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiQueryString]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 누르면 열리는 화면 — 글 · 이벤트 · 알림 내용 보기 · 앱 화면 · 이전 방식. */
  const destinationLabel = (row: CampaignRow): { text: string; href?: string; muted?: boolean } => {
    const eventId = readLinkedPlatformEventId(row.target_payload);
    if (eventId) {
      const resolved = eventTitleMap[eventId]?.trim();
      // platform_event_unresolved: 원본 확인 불가 (이전 방식과 다른 문구)
      return resolved
        ? { text: `${tx("admin_notifications_event")} · ${resolved}`, href: eventEditHref(eventId) }
        : { text: `${tx("admin_notifications_event")} · ${tx("admin_notifications_source_unavailable")}`, href: eventEditHref(eventId), muted: true };
    }
    const contentId = readLinkedContentId(row.target_payload);
    if (contentId) {
      const notice = noticeMap[contentId];
      const ct = parseCustomerCenterContentType(notice?.content_type ?? row.type, "notice");
      return {
        text: `${BOARD_LABEL[ct][lang]} · ${notice?.title?.trim() || formatAdminShortIdEllipsis(contentId)}`,
        href: `/admin/app/notices/${encodeURIComponent(contentId)}`,
      };
    }
    if (isInboxDetailDestinationPayload(row.target_payload)) return { text: tx("admin_notifications_notification_detail") };
    if (row.deeplink_url) return { text: `${tx("admin_notifications_app_screen")} · ${row.deeplink_url}` };
    return { text: tx("admin_notifications_legacy_no_linked_source"), muted: true };
  };

  /** 시각 — 보낸 시각(완료) · 예약 시각 · 만든 시각. */
  const timeOf = (row: CampaignRow): string => {
    const occ = row.latest_occurrence;
    const done = occ?.completed_at ?? row.sent_at;
    if (done) return formatAdminManilaDateTime(done);
    const next = occ?.scheduled_for ?? row.scheduled_at;
    if (next && row.send_mode !== "immediate") return `${formatAdminManilaDateTime(next)} ${tx("admin_notifications_scheduled_suffix")}`;
    return formatAdminManilaDateTime(row.created_at);
  };

  const toSentRow = (r: CampaignRow): SentRowLite => {
    const target = TARGET_LABEL[r.target_type];
    return {
      id: r.id,
      title: r.title,
      body: r.body ?? null,
      kind: kindOf(r),
      targetLabel: target ? (ko ? target.ko : target.en) : r.target_type,
      sentAtLabel: timeOf(r),
      destination: destinationLabel(r).text,
      stats: r.member_stats ?? null,
      status: r.effective_status ?? r.status,
      sendMode: r.send_mode ?? null,
      channel: r.channel ?? null,
      recurrence: recurrenceOf(r),
    };
  };

  /** 창에서 보내기·다시 보내기·반복을 마치면: 창을 닫고 새 줄이 있는 탭으로(전체 분류) 옮겨 그 줄을 강조한다(시안 v3). */
  const onModalDone = (done: ModalDone) => {
    setResendTarget(null);
    setRepeatRow(null);
    setSoundKind(null);
    setRecipientsRow(null);
    setComposeOpen(false);
    setNotice(done.message);
    setHighlightId(done.id ?? null);
    if (done.tab && (done.tab !== query.tab || query.type || query.status || query.q || query.aud || query.res)) {
      pushQuery({ tab: done.tab, type: null, status: null, q: null, aud: null, res: null });
    } else {
      void load();
    }
  };

  const selectKind = (k: KindTab) => {
    if (k === "update" || k === "owner") {
      const sp = new URLSearchParams({ view: k });
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      return;
    }
    pushQuery({ type: k === "all" ? null : k, status: null });
  };

  const archivableIds = rows.filter(isArchivable).map((r) => r.id);
  const allChecked = archivableIds.length > 0 && archivableIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 삭제(보관) · 복원 — 확인 1회. 여러 건은 순서대로 처리하고 실패한 건만 알린다. */
  const runAction = async (ids: string[], action: "archive" | "unarchive") => {
    if (ids.length === 0 || acting) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(action === "archive" ? "disable" : "resume"),
      ko,
      title:
        action === "archive"
          ? tx("admin_notifications_delete_n_notification_s", { n: ids.length })
          : tx("admin_notifications_restore_n_notification_s", { n: ids.length }),
      description:
        action === "archive"
          ? tx("admin_notifications_removed_from_list_notifications_already_in")
          : undefined,
      confirmLabel: action === "archive" ? tx("admin_notifications_delete") : tx("admin_notifications_restore"),
      destructive: action === "archive",
    });
    if (!confirmed.ok) return;
    setActing(true);
    setActionErr(null);
    let failed = 0;
    let lastError: string | null = null;
    try {
      for (const id of ids) {
        const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(id)}/actions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          failed += 1;
          lastError = j.error ?? null;
        }
      }
    } finally {
      setActing(false);
    }
    if (failed) {
      setActionErr(
        `${tx("admin_notifications_n_failed", { failed })} ${campaignCreateErrorMessage(lastError, lang)}`
      );
    }
    void load();
  };

  /** 반복 끝내기 — 기존 수명 주기 액션(stop_recurring). */
  const runLifecycle = async (id: string, action: "stop_recurring") => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("disable"),
      ko,
      title: tx("admin_notifications_end_repeat_confirm"),
      description: tx("admin_notifications_no_further_sends_sent_history_stays"),
      confirmLabel: tx("admin_notifications_end_repeat_action"),
      destructive: true,
    });
    if (!confirmed.ok) return;
    setActing(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(id)}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setActionErr(campaignCreateErrorMessage(j.error ?? null, lang));
      else setNotice(tx("admin_notifications_repeat_ended"));
    } finally {
      setActing(false);
    }
    void load();
  };

  const statusOptions =
    query.tab === "completed" ? CAMPAIGN_TAB_STATUSES.completed : query.tab === "in_progress" ? CAMPAIGN_TAB_STATUSES.in_progress : null;
  const hasFilters = Boolean(query.status || query.q || query.aud || query.res);
  const resetFilters = () => {
    setQDraft("");
    pushQuery({ status: null, type: null, q: null, aud: null, res: null });
  };
  const inArchive = query.tab === "archived";
  const canSelect = !inArchive && archivableIds.length > 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-sam-fg">{t("admin_menu_dibay_notification_campaigns")}</h1>
        <AdminActionButton variant="primary" onClick={() => setComposeOpen(true)} data-admin-notif-new="1">
          {tx("admin_notifications_send_notification")}
        </AdminActionButton>
      </div>
      {!sendAction.allowed && sendAction.reason ? (
        <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
          {t("admin_notifications_self_test_send_only_send_disabled", { reason: String(sendAction.reason) })}
        </p>
      ) : null}

      <AdminTabs
        ariaLabel={tx("admin_notifications_category")}
        tabs={KIND_TABS.map((k) => ({
          id: k,
          label:
            k === "all"
              ? tx("admin_notifications_all")
              : k === "owner"
                ? tx("admin_notifications_owner_notices")
                : tx(SENT_KIND_LABEL[k]),
          count: k === "update" ? updateCount : k === "owner" ? null : kindCounts[k] ?? null,
        }))}
        value={view}
        syncUrl={false}
        onChange={(k) => selectKind(k as KindTab)}
      />

      {notice ? (
        <p className="rounded-ui-rect border border-sam-success bg-sam-success-soft px-3 py-2 text-sm text-sam-success" role="status">
          {notice}
        </p>
      ) : null}

      {view === "update" ? (
        <AppReleaseNoticesPanel ko={ko} onCount={setUpdateCount} />
      ) : view === "owner" ? (
        <OwnerNoticesPanel ko={ko} />
      ) : (
      <>
      <AdminTabs
        ariaLabel={t("admin_menu_dibay_notification_campaigns")}
        tabs={LIST_TABS.map((tab) => ({ id: tab, label: tx(CAMPAIGN_TAB_LABEL_KEY[tab]), count: tabCounts[tab] ?? null }))}
        value={query.tab}
        syncUrl={false}
        onChange={(tab) => pushQuery({ tab: tab as CampaignListTab, status: null })}
      />

      <AdminFilterBar
        ko={ko}
        draft={{ q: qDraft, from: "", to: "" }}
        onDraftChange={(p) => {
          if (p.q !== undefined) setQDraft(p.q);
        }}
        onSubmit={() => pushQuery({ q: qDraft.trim() ? qDraft.trim().slice(0, 80) : null })}
        onReset={resetFilters}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={tx("admin_notifications_title")}
        status={
          statusOptions
            ? {
                value: query.status ?? "",
                label: t("admin_notif_th_status"),
                onChange: (v) => pushQuery({ status: v ? (v as CampaignListQuery["status"]) : null }),
                options: [
                  { value: "", label: t("admin_notif_filter_status_all") },
                  ...statusOptions.map((st) => ({ value: st, label: campaignStatusLabel(st, lang) })),
                ],
              }
            : undefined
        }
      >
        <AdminFilterSelect
          ko={ko}
          label={tx("admin_notifications_result")}
          name="res"
          value={query.res ?? ""}
          onChange={(v) => pushQuery({ res: v === "fail" || v === "ok" ? v : null })}
          options={[
            { value: "fail", label: tx("admin_notifications_has_push_failures") },
            { value: "ok", label: tx("admin_notifications_no_failures") },
          ]}
        />
        <AdminFilterSelect
          ko={ko}
          label={tx("admin_notifications_audience")}
          name="aud"
          value={query.aud ?? ""}
          onChange={(v) => pushQuery({ aud: v && v in TARGET_LABEL ? (v as CampaignListQuery["aud"]) : null })}
          options={Object.entries(TARGET_LABEL).map(([value, l]) => ({ value, label: ko ? l.ko : l.en }))}
        />
      </AdminFilterBar>

      {actionErr ? (
        <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">
          {actionErr}
        </p>
      ) : null}

      {canSelect ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-sam-muted">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => setSelected(allChecked ? new Set() : new Set(archivableIds))}
            />
            {tx("admin_notifications_select_page")}
          </label>
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={selected.size === 0 || acting}
            onClick={() => void runAction([...selected], "archive")}
            data-admin-notif-bulk-delete="1"
          >
            {selected.size ? tx("admin_notifications_delete_selected_n", { n: selected.size }) : tx("admin_notifications_delete_selected")}
          </AdminActionButton>
        </div>
      ) : null}

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : err ? (
        <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={tx("admin_notifications_no_matching_notifications")}
          onReset={hasFilters ? resetFilters : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          {/* 1366·1440 관리자 화면에서 가로 스크롤 없이(Production 1440 실측: 표 1332 > 칸 1118 → 줄임). */}
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-2 py-2" aria-label={tx("admin_notifications_select")} />
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_sent")}</th>
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_category")}</th>
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_title")}</th>
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_audience")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_target")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_inbox")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_push_ok")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_failed")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_opt_out")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_turned_off")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_quiet_hours")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_no_push")}</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">{tx("admin_notifications_opened")}</th>
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_result")}</th>
                <th className="whitespace-nowrap px-2 py-2">{tx("admin_notifications_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = r.effective_status ?? r.status;
                const target = TARGET_LABEL[r.target_type];
                const st = r.member_stats;
                const kind = kindOf(r);
                const sentLike = ["sent", "partially_failed", "failed"].includes(status);
                const recurring = r.send_mode === "recurring" && ["active", "paused"].includes(status);
                const rec = recurrenceOf(r);
                // 반복 줄은 숫자 대신 「—」(시안 v3) — 회차별 결과는 상세에서.
                const num = (n: number | undefined, cls = "") => (
                  <td className={`whitespace-nowrap px-2 py-3 text-right tabular-nums ${cls}`}>{st && !rec ? formatAdminNumber(n ?? 0) : "—"}</td>
                );
                // 확정 설계 B-13 — 알림함 전용 알림의 푸시 칸은 0 이 아니라 「해당 없음」
                const pushNa = r.channel === "in_app_only";
                const pushNum = (n: number | undefined, cls = "") =>
                  pushNa ? (
                    <td className="whitespace-nowrap px-2 py-3 text-right text-[12px] text-sam-muted">
                      {tx("admin_notifications_not_applicable")}
                    </td>
                  ) : (
                    num(n, cls)
                  );
                const nextAt = r.latest_occurrence?.status === "queued" ? r.latest_occurrence?.scheduled_for ?? null : null;
                const repeatLine = rec
                  ? `${REPEAT_KIND_KEY[rec.kind] ? tx(REPEAT_KIND_KEY[rec.kind]) : rec.kind}${
                      rec.kind === "weekly" && rec.weekday != null && WEEKDAY_KEYS[rec.weekday] ? ` ${tx(WEEKDAY_KEYS[rec.weekday])}` : ""
                    } ${rec.time}${nextAt ? ` · ${tx("admin_notifications_next")} ${formatAdminManilaDateTime(nextAt)}` : ""}`
                  : "";
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-sam-border-soft align-top ${
                      highlightId === r.id ? "bg-sam-success-soft" : adminOperatorRowClassFromNotificationStatus(status)
                    }`}
                    data-admin-notif-new-row={highlightId === r.id ? "1" : undefined}
                    data-admin-notif-status={status}
                  >
                    <td className="px-2 py-3">
                      {!inArchive && isArchivable(r) ? (
                        <input
                          type="checkbox"
                          aria-label={tx("admin_notifications_select")}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-[13px] text-sam-muted">{shortManilaTime(timeOf(r))}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <span className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[12px] font-semibold text-sam-fg">
                        {tx(SENT_KIND_LABEL[kind])}
                      </span>
                    </td>
                    {/* 1366 실측(2026-11-02 09:5x PHT, b96314162): 표 1045 > 칸 1029 — 제목 칸 160(잘린 제목은 title 로 전체). */}
                    <td className="max-w-[160px] px-2 py-3 2xl:max-w-[320px]">
                      <Link
                        href={`/admin/notifications/${r.id}`}
                        title={r.title}
                        className="block truncate font-medium text-sam-fg hover:underline"
                      >
                        {r.title}
                      </Link>
                      {r.body ? (
                        <p className="truncate text-[13px] text-sam-muted" title={r.body}>
                          {r.body}
                        </p>
                      ) : null}
                      {repeatLine ? <p className="text-[12px] text-sam-muted">{repeatLine}</p> : null}
                      {r.resend_of_at !== undefined && readResendOf(r.target_payload) ? (
                        <p className="text-[12px] text-sam-muted">
                          {tx("admin_notifications_resent")} (
                          <Link href={`/admin/notifications/${encodeURIComponent(readResendOf(r.target_payload))}`} className="hover:underline">
                            {tx("admin_notifications_original")}: {r.resend_of_at ? formatAdminManilaDateTime(r.resend_of_at) : "—"}
                          </Link>
                          )
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-[13px] text-sam-fg">
                      {target ? (ko ? target.ko : target.en) : r.target_type}
                    </td>
                    {num(st?.target)}
                    {num(st?.inbox)}
                    {pushNum(st?.push_ok, "text-sam-success")}
                    {pushNum(st?.push_fail, st && st.push_fail > 0 ? "text-sam-danger" : "")}
                    {pushNum(st?.push_optout ?? 0)}
                    {pushNum(st?.push_setting_off ?? 0)}
                    {pushNum(st?.push_quiet ?? 0)}
                    {pushNum(st?.push_none)}
                    {num(st?.opened)}
                    <td className="whitespace-nowrap px-2 py-3">
                      <SentResultBadge
                        status={status}
                        sendMode={r.send_mode ?? null}
                        stats={st ?? null}
                        channel={r.channel ?? null}
                        ko={ko}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <div className="flex flex-nowrap items-center gap-1">
                        {st && !rec ? (
                          <AdminActionButton variant="secondary" size="sm" onClick={() => setRecipientsRow(toSentRow(r))} data-admin-notif-recipients="1">
                            {tx("admin_notifications_recipients")}
                          </AdminActionButton>
                        ) : null}
                        {sentLike && !inArchive ? (
                          <AdminActionButton
                            variant="secondary"
                            size="sm"
                            disabled={!sendAction.allowed}
                            onClick={() => setResendTarget({ row: toSentRow(r), mode: st && st.push_fail > 0 ? "failed" : "same" })}
                            data-admin-notif-resend="1"
                          >
                            {st && st.push_fail > 0 ? tx("admin_notifications_resend_failed") : tx("admin_notifications_resend")}
                          </AdminActionButton>
                        ) : null}
                        {recurring ? (
                          <>
                            <AdminActionButton
                              variant="secondary"
                              size="sm"
                              disabled={!sendAction.allowed}
                              onClick={() => setRepeatRow(toSentRow(r))}
                              data-admin-notif-repeat-edit="1"
                            >
                              {tx("admin_notifications_repeat_settings")}
                            </AdminActionButton>
                            <AdminActionButton variant="secondary" size="sm" disabled={acting} onClick={() => void runLifecycle(r.id, "stop_recurring")}>
                              {tx("admin_notifications_end")}
                            </AdminActionButton>
                          </>
                        ) : null}
                        {/* 보낸 알림 줄 = 「받은 사람 · 다시 보내기」(시안 v3) — 상세는 제목, 삭제는 앞 칸 선택 후 「선택 삭제」. */}
                        {!(st && !rec) && !sentLike ? (
                          <Link href={`/admin/notifications/${r.id}`} className="text-[13px] text-signature hover:underline" data-admin-notif-manage="1">
                            {tx("admin_notifications_details")}
                          </Link>
                        ) : null}
                        {inArchive ? (
                          <AdminActionButton variant="secondary" size="sm" disabled={acting} onClick={() => void runAction([r.id], "unarchive")}>
                            {tx("admin_notifications_restore")}
                          </AdminActionButton>
                        ) : isArchivable(r) && !sentLike ? (
                          <AdminActionButton variant="secondary" size="sm" disabled={acting} onClick={() => void runAction([r.id], "archive")}>
                            {tx("admin_notifications_delete")}
                          </AdminActionButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        ko={ko}
        page={query.page}
        size={normalizeAdminListPageSize(query.pageSize)}
        total={total}
        disabled={loading}
        onPageChange={(page) => pushQuery({ page }, { keepPage: true })}
        onSizeChange={(pageSize) => pushQuery({ pageSize })}
      />
      </>
      )}

      <RecipientsModal
        row={recipientsRow}
        ko={ko}
        canSend={sendAction.allowed}
        onClose={() => setRecipientsRow(null)}
        onResend={(row, mode) => setResendTarget({ row, mode })}
        onRepeat={(row) => setRepeatRow(row)}
        onSound={(kind) => setSoundKind(kind)}
        soundReloadKey={soundReload}
      />
      <ResendModal target={resendTarget} ko={ko} onClose={() => setResendTarget(null)} onDone={onModalDone} />
      <RepeatModal row={repeatRow} ko={ko} onClose={() => setRepeatRow(null)} onDone={onModalDone} />
      <SoundModal
        kind={soundKind}
        ko={ko}
        onClose={() => setSoundKind(null)}
        onDone={(m) => {
          setSoundKind(null);
          setSoundReload((n) => n + 1);
          setNotice(m);
        }}
      />
      {/* 알림 보내기 — 같은 화면의 창(시안 v3). 폼은 수정 화면과 같은 하나(AdminNotificationCampaignCreatePage). */}
      <Modal open={composeOpen} wide onClose={() => setComposeOpen(false)} title={tx("admin_notifications_send_notification")}>
        <AdminNotificationCampaignCreatePage
          embedded={{
            onClose: () => setComposeOpen(false),
            onDone: (d) => onModalDone({ message: d.message, id: d.id, tab: d.tab }),
          }}
        />
      </Modal>
    </div>
  );
}
