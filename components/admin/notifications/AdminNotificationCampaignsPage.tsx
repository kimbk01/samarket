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
  CAMPAIGN_TAB_LABEL_EN,
  CAMPAIGN_TAB_LABEL_KO,
  CAMPAIGN_TAB_STATUSES,
  campaignListQueryToSearchParams,
  campaignStatusLabel,
  parseCampaignListQuery,
  type CampaignListQuery,
  type CampaignListTab,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { isInboxDetailDestinationPayload } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { campaignCreateErrorMessage } from "@/lib/admin/notification-campaigns/campaign-create-form";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { NOTIFICATIONS_CAMPAIGN_STATUS_NS } from "@/lib/admin/status-labels/notifications-status-labels";

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
  target_payload?: unknown;
};

type NoticeLite = { id: string; title: string; content_type?: string | null };

function readLinkedContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
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
  all: { ko: "전체 회원", en: "All members" },
  marketing_opt_in: { ko: "광고 수신 동의", en: "Opted-in" },
  selected_users: { ko: "회원 지정", en: "Specific members" },
  active_users: { ko: "최근 30일 활동", en: "Active 30d" },
  region: { ko: "지역", en: "Region" },
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
  const tx = (k: string, e: string) => (ko ? k : e);
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
      };
      if (!res.ok || !j?.ok) {
        setErr({ code: typeof j?.error === "string" ? j.error : "load_failed", httpStatus: res.status });
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(j.campaigns ?? []);
      setTotal(typeof j.total === "number" ? j.total : (j.campaigns ?? []).length);
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
        ? { text: `${tx("이벤트", "Event")} · ${resolved}`, href: eventEditHref(eventId) }
        : { text: `${tx("이벤트", "Event")} · ${tx("원본 확인 불가", "Source unavailable")}`, href: eventEditHref(eventId), muted: true };
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
    if (isInboxDetailDestinationPayload(row.target_payload)) return { text: tx("알림 내용 보기", "Notification detail") };
    if (row.deeplink_url) return { text: `${tx("앱 화면", "App screen")} · ${row.deeplink_url}` };
    return { text: tx("이전 방식 · 원본 연결 없음", "Legacy · no linked source"), muted: true };
  };

  /** 시각 — 보낸 시각(완료) · 예약 시각 · 만든 시각. */
  const timeOf = (row: CampaignRow): string => {
    const occ = row.latest_occurrence;
    const done = occ?.completed_at ?? row.sent_at;
    if (done) return formatAdminManilaDateTime(done);
    const next = occ?.scheduled_for ?? row.scheduled_at;
    if (next && row.send_mode !== "immediate") return `${formatAdminManilaDateTime(next)} ${tx("예약", "sched.")}`;
    return formatAdminManilaDateTime(row.created_at);
  };

  /** 결과 — 알림함 받은 회원 · 푸시 성공 건수 (실패가 있으면 함께). */
  const resultOf = (row: CampaignRow): { inbox: string; push: string } | null => {
    const occ = row.latest_occurrence;
    if (!occ || String(occ.trigger_type ?? "") === "test") return null;
    const failed = occ.push_failed ?? 0;
    return {
      inbox: tx(`알림함 ${formatAdminNumber(occ.in_app_sent ?? 0)}명`, `Inbox ${formatAdminNumber(occ.in_app_sent ?? 0)}`),
      push: tx(
        `푸시 ${formatAdminNumber(occ.push_sent ?? 0)}건${failed ? ` · 실패 ${formatAdminNumber(failed)}` : ""}`,
        `Push ${formatAdminNumber(occ.push_sent ?? 0)}${failed ? ` · failed ${formatAdminNumber(failed)}` : ""}`
      ),
    };
  };

  const openedOf = (row: CampaignRow): string => {
    if (!row.opened) return "—";
    const n = row.opened.push + row.opened.in_app;
    return `${formatAdminNumber(n)}${row.opened.capped ? "+" : ""}`;
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
          ? tx(`알림 ${ids.length}건을 삭제하시겠습니까?`, `Delete ${ids.length} notification(s)?`)
          : tx(`알림 ${ids.length}건을 되돌리시겠습니까?`, `Restore ${ids.length} notification(s)?`),
      description:
        action === "archive"
          ? tx(
              "목록에서 지워집니다. 회원 알림함에 이미 간 알림은 그대로 남고, 「삭제한 알림」에서 되돌릴 수 있습니다.",
              "Removed from this list. Notifications already in members' inboxes stay; restore from Deleted."
            )
          : undefined,
      confirmLabel: action === "archive" ? tx("삭제", "Delete") : tx("되돌리기", "Restore"),
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
        `${tx(`${failed}건을 처리하지 못했습니다.`, `${failed} failed.`)} ${campaignCreateErrorMessage(lastError, lang)}`
      );
    }
    void load();
  };

  const tabLabels = lang === "en" ? CAMPAIGN_TAB_LABEL_EN : CAMPAIGN_TAB_LABEL_KO;
  const statusOptions =
    query.tab === "completed" ? CAMPAIGN_TAB_STATUSES.completed : query.tab === "in_progress" ? CAMPAIGN_TAB_STATUSES.in_progress : null;
  const hasFilters = Boolean(query.status || query.q);
  const resetFilters = () => {
    setQDraft("");
    pushQuery({ status: null, type: null, q: null });
  };
  const inArchive = query.tab === "archived";
  const canSelect = !inArchive && archivableIds.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-sam-fg">{t("admin_menu_dibay_notification_campaigns")}</h1>
        <AdminActionLink href="/admin/notifications/create" variant="primary" data-admin-notif-new="1">
          {tx("알림 보내기", "Send notification")}
        </AdminActionLink>
      </div>
      {!sendAction.allowed && sendAction.reason ? (
        <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
          {ko ? `본인 테스트 발송만 가능합니다. 실제 발송 비활성: ${sendAction.reason}` : `Self test-send only. Send disabled: ${sendAction.reason}`}
        </p>
      ) : null}

      <AdminTabs
        ariaLabel={t("admin_menu_dibay_notification_campaigns")}
        tabs={LIST_TABS.map((tab) => ({ id: tab, label: tabLabels[tab] }))}
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
        searchPlaceholder={tx("제목", "Title")}
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
      />

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
            {tx("이 페이지 전체 선택", "Select page")}
          </label>
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={selected.size === 0 || acting}
            onClick={() => void runAction([...selected], "archive")}
            data-admin-notif-bulk-delete="1"
          >
            {tx(`선택 삭제${selected.size ? ` (${selected.size})` : ""}`, `Delete selected${selected.size ? ` (${selected.size})` : ""}`)}
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
          message={hasFilters ? undefined : tx("알림이 없습니다.", "No notifications.")}
          onReset={hasFilters ? resetFilters : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full min-w-[960px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[132px]" />
              <col />
              <col className="w-[200px]" />
              <col className="w-[112px]" />
              <col className="w-[136px]" />
              <col className="w-[64px]" />
              <col className="w-[96px]" />
              <col className="w-[88px]" />
            </colgroup>
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-3 py-2" aria-label={tx("선택", "Select")} />
                <th className="whitespace-nowrap px-3 py-2">{tx("시각", "Time")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("제목", "Title")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("누르면 열리는 화면", "Opens")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("받는 사람", "Recipients")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("결과", "Result")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("열람", "Opened")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("상태", "Status")}</th>
                <th className="whitespace-nowrap px-3 py-2">{tx("작업", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = r.effective_status ?? r.status;
                const dest = destinationLabel(r);
                const result = resultOf(r);
                const target = TARGET_LABEL[r.target_type];
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-sam-border-soft align-top ${adminOperatorRowClassFromNotificationStatus(status)}`}
                    data-admin-notif-status={status}
                  >
                    <td className="px-3 py-3">
                      {!inArchive && isArchivable(r) ? (
                        <input
                          type="checkbox"
                          aria-label={tx("선택", "Select")}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] text-sam-muted">{timeOf(r)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/notifications/${r.id}`} className="block truncate font-medium text-sam-fg hover:underline">
                        {r.title}
                      </Link>
                      {r.body ? <p className="truncate text-[13px] text-sam-muted">{r.body}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-[13px]">
                      {dest.href ? (
                        <Link href={dest.href} className={`block truncate hover:underline ${dest.muted ? "text-sam-muted" : "text-sam-fg"}`}>
                          {dest.text}
                        </Link>
                      ) : (
                        <span className={`block truncate ${dest.muted ? "text-sam-muted" : "text-sam-fg"}`}>{dest.text}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] text-sam-fg">
                      {target ? (ko ? target.ko : target.en) : r.target_type}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-sam-fg" data-admin-notif-col="delivered">
                      {result ? (
                        <>
                          <span className="block whitespace-nowrap">{result.inbox}</span>
                          <span className="block whitespace-nowrap text-sam-muted">{result.push}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] text-sam-fg" data-admin-notif-col="opened">
                      {openedOf(r)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <AdminStatusLabel namespace={NOTIFICATIONS_CAMPAIGN_STATUS_NS} code={status} ko={ko} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Link href={`/admin/notifications/${r.id}`} className="text-[13px] text-signature hover:underline" data-admin-notif-manage="1">
                          {tx("상세", "Details")}
                        </Link>
                        {inArchive ? (
                          <AdminActionButton variant="secondary" size="sm" disabled={acting} onClick={() => void runAction([r.id], "unarchive")}>
                            {tx("되돌리기", "Restore")}
                          </AdminActionButton>
                        ) : isArchivable(r) ? (
                          <AdminActionButton variant="secondary" size="sm" disabled={acting} onClick={() => void runAction([r.id], "archive")}>
                            {tx("삭제", "Delete")}
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
    </div>
  );
}
