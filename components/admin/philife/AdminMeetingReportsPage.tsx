"use client";

/**
 * 모임 신고 `/admin/philife/meeting-reports` (설계 §C-4) — 신고 처리함과 같은 목록 틀·버튼.
 * 원장: meeting_reports (피드 신고와 다른 원장). 상태 변경은 PATCH /api/admin/philife/meeting-reports/:id 만 —
 * 모든 요청에 expectedStatus(CAS) · 인정/기각/다시 열기는 사유 필수 · 실패하면 화면 상태를 바꾸지 않고 배너(C-11).
 * 탭·필터·페이지(20/50/100, URL size)는 URL (`?status=` 대시보드 진입 = 처리 대기).
 * 행 버튼 2개 이하(검토 시작 · 처리하기) — 인정·기각·다시 열기는 처리 Drawer 하단([닫기] · [보조][주 동작]).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminMe } from "@/hooks/useAdminMe";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { ARO_IA_001_OWNERS } from "@/lib/admin/aro-ia-001-community-common-links";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListEmpty,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import {
  MEETING_REPORT_TABS,
  MEETING_REPORT_TARGET_OPTIONS,
  type MeetingReportAdminRow,
  type MeetingReportFilters,
  type MeetingReportListResult,
  type MeetingReportStatus,
  type MeetingReportTab,
} from "@/components/admin/community/reports/meeting-report-contract";
import {
  CommunityBannerView,
  CommunityDrawer,
  CommunitySection,
  communityActionFetch,
  communityAdminErrorText,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";

const TAB_LABEL: Record<MeetingReportTab, MessageKey> = {
  pending: "admin_philife_meeting_reports_tab_pending",
  reviewing: "admin_philife_meeting_reports_tab_reviewing",
  resolved: "admin_philife_meeting_reports_tab_resolved",
  rejected: "admin_philife_meeting_reports_tab_rejected",
  all: "admin_philife_meeting_reports_tab_all",
};

const EMPTY_TEXT: Record<MeetingReportTab, MessageKey> = {
  pending: "admin_philife_meeting_reports_empty_pending",
  reviewing: "admin_philife_meeting_reports_empty_reviewing",
  resolved: "admin_philife_meeting_reports_empty_resolved",
  rejected: "admin_philife_meeting_reports_empty_rejected",
  all: "admin_philife_meeting_reports_empty_all",
};

/** 조회 조건 추가 키 (URL) — 탭(`status`)은 [초기화] 후에도 유지 */
const MEETING_REPORT_EXTRAS = ["type"] as const;

const REASON_LABEL: Record<string, MessageKey> = {
  spam: "admin_philife_meeting_reports_reason_spam",
  abuse: "admin_philife_meeting_reports_reason_abuse",
  sexual: "admin_philife_meeting_reports_reason_sexual",
  illegal: "admin_philife_meeting_reports_reason_illegal",
  impersonation: "admin_philife_meeting_reports_reason_impersonation",
  off_topic: "admin_philife_meeting_reports_reason_off_topic",
  etc: "admin_philife_meeting_reports_reason_etc",
};

function reasonKey(type: string): MessageKey {
  return REASON_LABEL[type] ?? "admin_philife_meeting_reports_reason_etc";
}

const PHT = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

/** 상태별 허용 버튼 (전이표) */
function meetingReportActions(status: MeetingReportStatus, isSuperAdmin: boolean): Array<"review" | "resolve" | "reject" | "reopen"> {
  if (status === "pending") return ["review", "reject", "resolve"];
  if (status === "reviewing") return ["reject", "resolve"];
  return isSuperAdmin ? ["reopen"] : [];
}

function meetingHref(meetingId: string | null): string | null {
  return meetingId ? `/admin/community/meetings?meetingId=${encodeURIComponent(meetingId)}` : null;
}

function TargetCell({ r, ko }: { r: MeetingReportAdminRow; ko: boolean }) {
  const { t } = useI18n();
  const type = adminCommunityLabel("report_target", r.target_type, ko).label;
  const mHref = meetingHref(r.meeting_id);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="sam-text-xxs font-semibold text-sam-muted">{type}</span>
      {r.target_type === "member" ? (
        <CommunityAuthorCell userId={r.target_id} nickname={r.target_member?.nickname} handle={r.target_member?.handle} />
      ) : null}
      {mHref ? (
        <Link href={mHref} onClick={(e) => e.stopPropagation()} className="font-medium text-sam-info hover:underline">
          {r.meeting_title?.trim() || t("admin_philife_meeting_reports_view_meeting")}
        </Link>
      ) : (
        <span className="text-sam-muted">{t("admin_philife_meeting_reports_target_no_meeting")}</span>
      )}
    </span>
  );
}

export function AdminMeetingReportsPage({
  result,
  filters,
}: {
  result: MeetingReportListResult;
  filters: MeetingReportFilters;
  /** 서버가 쓴 페이지 크기 (URL size 와 같다 — 표시는 lq 기준) */
  pageSize?: number;
}) {
  const router = useRouter();
  const { t, language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: MEETING_REPORT_EXTRAS, keepOnReset: { status: true } });
  /** 다시 열기는 최고 관리자만 (전이표) — 나머지 쓰기 판정은 접근표 action community("moderation"). 서버 가드는 그대로. */
  const { isSuperAdmin } = useAdminMe();
  const action = useAdminRouteAction("/admin/philife/meeting-reports");
  const canModerate = action.allowed;
  const deniedTitle = canModerate ? undefined : (action.reason ?? undefined);
  // ?rid= (다른 화면에서 특정 신고로 진입) → 이 페이지에 있으면 처리 시트를 연다
  const [openId, setOpenId] = useState(() => qs.get("rid"));
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "resolve" | "reject" | "reopen"; row: MeetingReportAdminRow }>(null);
  const lastJson = useRef<Record<string, unknown>>({});

  const open = result.rows.find((r) => r.id === openId) ?? null;

  const afterChange = (b: CommunityBanner) => {
    emitAdminQueueChanged("meeting_reports");
    router.refresh();
    setBanner(b);
  };

  /** 「검토 시작」 L0 */
  const startReview = async (r: MeetingReportAdminRow) => {
    if (!canModerate) return;
    setBusyId(r.id);
    setBanner(null);
    const { result: res, json } = await communityActionFetch(
      `/api/admin/philife/meeting-reports/${encodeURIComponent(r.id)}`,
      "PATCH",
      { status: "reviewing", expectedStatus: r.status }
    );
    setBusyId(null);
    if (res.ok) {
      const warn = communityWarningsOf(json, language);
      afterChange({ tone: warn.length ? "warning" : "success", text: t("admin_philife_meeting_reports_review_started"), extra: warn });
    } else if (res.status === 409) {
      router.refresh();
      setBanner({ tone: "warning", text: t("admin_community_post_stale") });
    } else {
      // 실패하면 상태를 바꾸지 않는다 (C-11)
      setBanner({ tone: "error", text: communityAdminErrorText(res.code, ko) });
    }
  };

  const settle = (kind: CommunitySheetSettle, okText: string) => {
    setSheet(null);
    if (kind === "stale") {
      router.refresh();
      setBanner({ tone: "warning", text: t("admin_community_post_stale") });
      return;
    }
    if (kind === "gone") {
      router.refresh();
      setBanner({ tone: "error", text: communityAdminErrorText("not_found", ko) });
      return;
    }
    const warn = communityWarningsOf(lastJson.current, language);
    afterChange({ tone: warn.length ? "warning" : "success", text: okText, extra: warn });
  };

  /** 표 행 — ghost/sm 2개 이하 (검토 시작 · 처리하기/보기) */
  const rowActions = (r: MeetingReportAdminRow) => {
    const allowed = meetingReportActions(r.status, isSuperAdmin);
    return (
      <div className="flex flex-wrap justify-end gap-1.5" data-admin-report-cta-state={r.status}>
        {allowed.includes("review") ? (
          <AdminActionButton
            variant="ghost"
            size="sm"
            disabled={busyId === r.id || !canModerate}
            title={deniedTitle}
            onClick={() => void startReview(r)}
          >
            {busyId === r.id ? t("admin_philife_meeting_reports_processing") : t("admin_philife_meeting_reports_start_review")}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="ghost" size="sm" onClick={() => setOpenId(r.id)}>
          {r.status === "pending" || r.status === "reviewing"
            ? t("admin_philife_meeting_reports_handle")
            : t("admin_philife_meeting_reports_view")}
        </AdminActionButton>
      </div>
    );
  };

  /** 처리 Drawer 하단 오른쪽 — [보조][주 동작] (신고 인정이 주 동작) */
  const drawerActions = (r: MeetingReportAdminRow) => {
    const allowed = meetingReportActions(r.status, isSuperAdmin);
    return (
      <div className="flex flex-wrap justify-end gap-1.5" data-admin-report-cta-state={r.status}>
        {allowed.includes("reopen") ? (
          <AdminActionButton
            variant="secondary"
            disabled={busyId === r.id || !canModerate}
            title={deniedTitle}
            onClick={() => {
              if (canModerate) setSheet({ kind: "reopen", row: r });
            }}
          >
            {t("admin_philife_meeting_reports_reopen")}
          </AdminActionButton>
        ) : null}
        {allowed.includes("review") ? (
          <AdminActionButton
            variant="secondary"
            disabled={busyId === r.id || !canModerate}
            title={deniedTitle}
            onClick={() => void startReview(r)}
          >
            {busyId === r.id ? t("admin_philife_meeting_reports_processing") : t("admin_philife_meeting_reports_start_review")}
          </AdminActionButton>
        ) : null}
        {allowed.includes("reject") ? (
          <AdminActionButton
            variant="secondary"
            disabled={busyId === r.id || !canModerate}
            title={deniedTitle}
            onClick={() => {
              if (canModerate) setSheet({ kind: "reject", row: r });
            }}
          >
            {t("admin_philife_meeting_reports_dismiss")}
          </AdminActionButton>
        ) : null}
        {allowed.includes("resolve") ? (
          <AdminActionButton
            variant="primary"
            disabled={busyId === r.id || !canModerate}
            title={deniedTitle}
            onClick={() => {
              if (canModerate) setSheet({ kind: "resolve", row: r });
            }}
          >
            {t("admin_philife_meeting_reports_accept")}
          </AdminActionButton>
        ) : null}
      </div>
    );
  };

  const sheetRows = (r: MeetingReportAdminRow) => [
    { label: t("admin_philife_meeting_reports_row_meeting"), value: r.meeting_title?.trim() || "—" },
    { label: t("admin_philife_meeting_reports_row_report_target"), value: adminCommunityLabel("report_target", r.target_type, ko).label },
    { label: t("admin_philife_meeting_reports_row_reason"), value: t(reasonKey(r.reason_type)) },
    { label: t("admin_philife_meeting_reports_row_reporter"), value: r.reporter?.nickname?.trim() || t("admin_philife_meeting_reports_no_name") },
  ];

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="meeting-reports">
      <span className="sr-only" data-admin-meeting-reports-owner={ARO_IA_001_OWNERS.meetingReport} />
      <CommunityListShell
        title={t("admin_philife_meeting_reports_title")}
        description={t("admin_philife_meeting_reports_desc")}
        actions={
          <AdminActionButton variant="secondary" disabled={busyId !== null} onClick={() => router.refresh()}>
            {t("admin_philife_meeting_reports_refresh")}
          </AdminActionButton>
        }
        banner={
          <>
            {!action.allowed && action.reason ? (
              <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
                {t("admin_philife_meeting_reports_list_actions_disabled", { reason: action.reason })}
              </p>
            ) : null}
            <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />
            {filters.periodError ? (
              <CommunityBannerView banner={{ tone: "error", text: communityAdminErrorText(filters.periodError, ko) }} />
            ) : null}
          </>
        }
        tabs={
          <CommunityTabs
            value={filters.tab}
            onChange={(v) => qs.set({ status: v })}
            tabs={MEETING_REPORT_TABS.map((k) => ({ value: k, label: t(TAB_LABEL[k]), count: result.counts?.[k] ?? null }))}
          />
        }
        filterBar={
          <CommunityFilterBar lq={lq} searchPlaceholder={t("admin_philife_meeting_reports_search_placeholder")}>
            <CommunityFilterField label={t("admin_philife_meeting_reports_row_report_target")}>
              <CommunitySelect
                value={filters.type}
                onChange={(v) => lq.setExtra("type", v)}
                options={[
                  { value: "", label: t("admin_philife_meeting_reports_tab_all") },
                  ...MEETING_REPORT_TARGET_OPTIONS.map((tg) => ({ value: tg, label: adminCommunityLabel("report_target", tg, ko).label })),
                ]}
              />
            </CommunityFilterField>
          </CommunityFilterBar>
        }
        footer={result.ok ? <CommunityListPagination lq={lq} total={result.total} /> : null}
      >
        {!result.ok ? (
          <AdminErrorState ko={ko} code="load_failed" onRetry={() => router.refresh()} />
        ) : result.rows.length === 0 ? (
          <CommunityListEmpty lq={lq} message={t(EMPTY_TEXT[filters.tab])} />
        ) : (
          <CommunityTable head={[
            t("admin_philife_meeting_reports_col_target"),
            t("admin_philife_meeting_reports_row_reason"),
            t("admin_philife_meeting_reports_row_reporter"),
            t("admin_philife_meeting_reports_col_received"),
            t("admin_philife_meeting_reports_col_status"),
            t("admin_philife_meeting_reports_col_action"),
          ]}>
            {result.rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`cursor-pointer border-b border-sam-border-soft hover:bg-sam-app ${openId === r.id ? "bg-sam-warning-soft" : ""}`}
              >
                <td className={COMMUNITY_TD}>
                  <TargetCell r={r} ko={ko} />
                </td>
                <td className={COMMUNITY_TD}>
                  <span className="font-medium text-sam-fg">{t(reasonKey(r.reason_type))}</span>
                  {r.reason_detail ? <p className="line-clamp-2 max-w-[16rem] sam-text-xxs text-sam-muted">{r.reason_detail}</p> : null}
                </td>
                <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                  <CommunityAuthorCell userId={r.reporter_user_id || null} nickname={r.reporter?.nickname} handle={r.reporter?.handle} />
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.created_at} />
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="meeting_report_status" value={r.status} ko={ko} />
                </td>
                <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                  {rowActions(r)}
                </td>
              </tr>
            ))}
          </CommunityTable>
        )}
      </CommunityListShell>

      {open ? (
        <CommunityDrawer
          title={t("admin_philife_meeting_reports_drawer_title")}
          onClose={() => setOpenId("")}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AdminActionButton variant="neutral" onClick={() => setOpenId("")}>
                {t("admin_philife_meeting_reports_close")}
              </AdminActionButton>
              {drawerActions(open)}
            </div>
          }
        >
          <div className="space-y-4">
            <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />
            <CommunitySection title={t("admin_philife_meeting_reports_section_target")}>
              <CommunitySummaryCard
                rows={[
                  {
                    label: t("admin_philife_meeting_reports_row_meeting"),
                    value: meetingHref(open.meeting_id) ? (
                      <Link href={meetingHref(open.meeting_id) as string} className="font-medium text-sam-info hover:underline">
                        {open.meeting_title?.trim() || t("admin_philife_meeting_reports_view_meeting")}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  { label: t("admin_philife_meeting_reports_col_target"), value: <TargetCell r={open} ko={ko} /> },
                  { label: t("admin_philife_meeting_reports_row_reason"), value: t(reasonKey(open.reason_type)) },
                  {
                    label: t("admin_philife_meeting_reports_row_detail"),
                    value: <span className="whitespace-pre-wrap">{open.reason_detail?.trim() || "—"}</span>,
                  },
                  {
                    label: t("admin_philife_meeting_reports_row_reporter"),
                    value: (
                      <CommunityAuthorCell userId={open.reporter_user_id || null} nickname={open.reporter?.nickname} handle={open.reporter?.handle} />
                    ),
                  },
                  { label: t("admin_philife_meeting_reports_row_received_at"), value: PHT(open.created_at) },
                  { label: t("admin_philife_meeting_reports_row_report_status"), value: <CommunityStatusBadge domain="meeting_report_status" value={open.status} ko={ko} /> },
                ]}
              />
            </CommunitySection>
            <CommunitySection title={t("admin_philife_meeting_reports_section_history")}>
              <CommunityTimeline
                items={
                  open.reviewed_at
                    ? [
                        {
                          id: open.id,
                          at: open.reviewed_at,
                          actor: open.reviewed_by_label ?? t("admin_philife_meeting_reports_admin"),
                          action: adminCommunityLabel("meeting_report_status", open.status, ko).label,
                          reason: open.action_result,
                        },
                      ]
                    : []
                }
              />
            </CommunitySection>
            <CommunitySection title={t("admin_philife_meeting_reports_section_action")}>
              {!canModerate && action.reason ? (
                <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
                  {t("admin_philife_meeting_reports_drawer_actions_disabled", { reason: action.reason })}
                </p>
              ) : null}
              {canModerate && (open.status === "resolved" || open.status === "rejected") && !isSuperAdmin ? (
                <p className="text-[13px] text-sam-muted">{t("admin_philife_meeting_reports_closed_reopen_super_only")}</p>
              ) : null}
              {canModerate && (open.status === "pending" || open.status === "reviewing") ? (
                <p className="text-[13px] text-sam-muted">{t("admin_philife_meeting_reports_action_hint")}</p>
              ) : null}
            </CommunitySection>
            <AdminTechDetails ko={ko}>
              <div>{t("admin_philife_meeting_reports_tech_report_id", { id: open.id })}</div>
              <div>{t("admin_philife_meeting_reports_tech_target", { type: open.target_type, id: open.target_id })}</div>
              {open.meeting_id ? <div>{t("admin_philife_meeting_reports_tech_meeting_id", { id: open.meeting_id })}</div> : null}
              <div>{t("admin_philife_meeting_reports_tech_status", { status: open.status })}</div>
            </AdminTechDetails>
          </div>
        </CommunityDrawer>
      ) : null}

      {sheet ? (
        <CommunityActionSheet
          key={`${sheet.kind}:${sheet.row.id}`}
          title={
            sheet.kind === "resolve"
              ? t("admin_philife_meeting_reports_accept")
              : sheet.kind === "reject"
                ? t("admin_philife_meeting_reports_dismiss")
                : t("admin_philife_meeting_reports_reopen")
          }
          rows={sheetRows(sheet.row)}
          notice={
            sheet.kind === "reopen"
              ? t("admin_philife_meeting_reports_reopen_notice")
              : sheet.kind === "resolve"
                ? t("admin_philife_meeting_reports_resolve_notice")
                : t("admin_philife_meeting_reports_reject_notice")
          }
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: t("admin_philife_meeting_reports_reason_placeholder") }}
          confirmLabel={
            sheet.kind === "resolve"
              ? t("admin_philife_meeting_reports_accept")
              : sheet.kind === "reject"
                ? t("admin_philife_meeting_reports_dismiss")
                : t("admin_philife_meeting_reports_reopen")
          }
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            if (!canModerate) return { ok: false, status: 403, code: "forbidden" };
            const next = sheet.kind === "resolve" ? "resolved" : sheet.kind === "reject" ? "rejected" : "pending";
            const { result: res, json } = await communityActionFetch(
              `/api/admin/philife/meeting-reports/${encodeURIComponent(sheet.row.id)}`,
              "PATCH",
              { status: next, expectedStatus: sheet.row.status, reason }
            );
            lastJson.current = json;
            return res;
          }}
          onSettled={(kind) =>
            settle(
              kind,
              sheet.kind === "resolve"
                ? t("admin_philife_meeting_reports_resolved")
                : sheet.kind === "reject"
                  ? t("admin_philife_meeting_reports_rejected")
                  : t("admin_philife_meeting_reports_reopened")
            )
          }
        />
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}
