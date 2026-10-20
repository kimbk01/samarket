"use client";

/**
 * 모임 신고 `/admin/philife/meeting-reports` (설계 §C-4) — 신고 처리함과 같은 목록 틀·버튼.
 * 원장: meeting_reports (피드 신고와 다른 원장). 상태 변경은 PATCH /api/admin/philife/meeting-reports/:id 만 —
 * 모든 요청에 expectedStatus(CAS) · 인정/기각/다시 열기는 사유 필수 · 실패하면 화면 상태를 바꾸지 않고 배너(C-11).
 * 탭·필터·페이지는 URL (`?status=` 대시보드 진입 = 처리 대기).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import { ARO_IA_001_OWNERS } from "@/lib/admin/aro-ia-001-community-common-links";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
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
  CommunityListShell,
  CommunityPagination,
  CommunitySelect,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
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
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  CommunityDrawer,
  CommunitySection,
  communityActionFetch,
  communityAdminErrorText,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";

const TAB_LABEL: Record<MeetingReportTab, string> = {
  pending: "처리 대기",
  reviewing: "검토 중",
  resolved: "신고 인정",
  rejected: "신고 기각",
  all: "전체",
};

const EMPTY_TEXT: Record<MeetingReportTab, string> = {
  pending: "처리할 모임 신고가 없습니다.",
  reviewing: "검토 중인 모임 신고가 없습니다.",
  resolved: "인정한 모임 신고가 없습니다.",
  rejected: "기각한 모임 신고가 없습니다.",
  all: "모임 신고가 없습니다.",
};

const REASON_LABEL: Record<string, string> = {
  spam: "스팸·도배",
  abuse: "욕설·비방",
  sexual: "음란·성적 내용",
  illegal: "불법 행위",
  impersonation: "사칭",
  off_topic: "모임과 무관한 내용",
  etc: "기타",
};

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
          {r.meeting_title?.trim() || "모임 보기"}
        </Link>
      ) : (
        <span className="text-sam-muted">모임 정보 없음</span>
      )}
    </span>
  );
}

export function AdminMeetingReportsPage({
  result,
  filters,
  pageSize,
}: {
  result: MeetingReportListResult;
  filters: MeetingReportFilters;
  pageSize: number;
}) {
  const router = useRouter();
  const { language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const { permissions, isSuperAdmin, loading: meLoading } = useAdminMe();
  const canModerate = meLoading || communityAreaAllowed(permissions, "moderation", isSuperAdmin);
  // ?rid= (다른 화면에서 특정 신고로 진입) → 이 페이지에 있으면 처리 시트를 연다
  const [openId, setOpenId] = useState(() => qs.get("rid"));
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "resolve" | "reject" | "reopen"; row: MeetingReportAdminRow }>(null);
  const lastJson = useRef<Record<string, unknown>>({});

  const open = result.rows.find((r) => r.id === openId) ?? null;
  const isFiltered = qs.hasAny(["q", "type", "period", "from", "to"]);

  const afterChange = (b: CommunityBanner) => {
    emitAdminQueueChanged("meeting_reports");
    router.refresh();
    setBanner(b);
  };

  /** 「검토 시작」 L0 */
  const startReview = async (r: MeetingReportAdminRow) => {
    setBusyId(r.id);
    setBanner(null);
    const { result: res, json } = await communityActionFetch(
      `/api/admin/philife/meeting-reports/${encodeURIComponent(r.id)}`,
      "PATCH",
      { status: "reviewing", expectedStatus: r.status }
    );
    setBusyId(null);
    if (res.ok) {
      const warn = communityWarningsOf(json);
      afterChange({ tone: warn.length ? "warning" : "success", text: "검토를 시작했습니다.", extra: warn });
    } else if (res.status === 409) {
      router.refresh();
      setBanner({ tone: "warning", text: COMMUNITY_STALE_TEXT });
    } else {
      // 실패하면 상태를 바꾸지 않는다 (C-11)
      setBanner({ tone: "error", text: communityAdminErrorText(res.code, ko) });
    }
  };

  const settle = (kind: CommunitySheetSettle, okText: string) => {
    setSheet(null);
    if (kind === "stale") {
      router.refresh();
      setBanner({ tone: "warning", text: COMMUNITY_STALE_TEXT });
      return;
    }
    if (kind === "gone") {
      router.refresh();
      setBanner({ tone: "error", text: communityAdminErrorText("not_found", ko) });
      return;
    }
    const warn = communityWarningsOf(lastJson.current);
    afterChange({ tone: warn.length ? "warning" : "success", text: okText, extra: warn });
  };

  /** 상세 Drawer 의 처리 버튼 — [보조…][주 동작(신고 인정)] 순서, primary 1개 */
  const actionsFor = (r: MeetingReportAdminRow) => {
    const allowed = canModerate ? meetingReportActions(r.status, isSuperAdmin) : [];
    return (
      <div className="flex flex-wrap justify-end gap-1.5" data-admin-report-cta-state={r.status}>
        {allowed.includes("reopen") ? (
          <AdminActionButton variant="secondary" onClick={() => setSheet({ kind: "reopen", row: r })}>
            다시 열기
          </AdminActionButton>
        ) : null}
        {allowed.includes("review") ? (
          <AdminActionButton variant="secondary" disabled={busyId === r.id} onClick={() => void startReview(r)}>
            {busyId === r.id ? "처리 중" : "검토 시작"}
          </AdminActionButton>
        ) : null}
        {allowed.includes("reject") ? (
          <AdminActionButton variant="secondary" disabled={busyId === r.id} onClick={() => setSheet({ kind: "reject", row: r })}>
            신고 기각
          </AdminActionButton>
        ) : null}
        {allowed.includes("resolve") ? (
          <AdminActionButton variant="primary" disabled={busyId === r.id} onClick={() => setSheet({ kind: "resolve", row: r })}>
            신고 인정
          </AdminActionButton>
        ) : null}
      </div>
    );
  };

  /** 표 행 버튼 — ghost/sm 최대 2개 (「검토 시작」 + 「처리」). 인정·기각·다시 열기는 상세 Drawer 에서. */
  const rowActions = (r: MeetingReportAdminRow) => {
    const allowed = canModerate ? meetingReportActions(r.status, isSuperAdmin) : [];
    const pending = r.status === "pending" || r.status === "reviewing";
    return (
      <div className="flex flex-wrap justify-end gap-1" data-admin-report-cta-state={r.status}>
        {allowed.includes("review") ? (
          <AdminActionButton variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => void startReview(r)}>
            {busyId === r.id ? "처리 중" : "검토 시작"}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="ghost" size="sm" onClick={() => setOpenId(r.id)}>
          {pending && allowed.length > 0 ? "처리" : "상세"}
        </AdminActionButton>
      </div>
    );
  };

  const sheetRows = (r: MeetingReportAdminRow) => [
    { label: "모임", value: r.meeting_title?.trim() || "—" },
    { label: "신고 대상", value: adminCommunityLabel("report_target", r.target_type, ko).label },
    { label: "사유", value: REASON_LABEL[r.reason_type] ?? "기타" },
    { label: "신고자", value: r.reporter?.nickname?.trim() || "이름 없음" },
  ];

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="meeting-reports">
      <span className="sr-only" data-admin-meeting-reports-owner={ARO_IA_001_OWNERS.meetingReport} />
      <CommunityListShell
        title="모임 신고"
        description="모임·모임 회원·모임 게시물에 대한 신고를 확인하고 인정 또는 기각합니다."
        actions={
          <AdminActionButton variant="secondary" onClick={() => router.refresh()}>
            새로고침
          </AdminActionButton>
        }
        banner={
          <>
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
            tabs={MEETING_REPORT_TABS.map((k) => ({ value: k, label: TAB_LABEL[k], count: result.counts?.[k] ?? null }))}
          />
        }
        filterBar={
          <CommunityFilterBar
            ko={ko}
            showPeriod
            searchPlaceholder="모임 이름·신고자 닉네임"
            resetKeep={["status"]}
            onRefresh={() => router.refresh()}
          >
            <CommunityFilterField label="신고 대상">
              <CommunitySelect
                value={filters.type}
                onChange={(v) => qs.set({ type: v })}
                options={[
                  { value: "", label: "전체" },
                  ...MEETING_REPORT_TARGET_OPTIONS.map((t) => ({ value: t, label: adminCommunityLabel("report_target", t, ko).label })),
                ]}
              />
            </CommunityFilterField>
          </CommunityFilterBar>
        }
        footer={
          result.ok && result.total > 0 ? (
            <CommunityPagination
              page={qs.page}
              pageSize={pageSize}
              total={result.total}
              onPage={qs.setPage}
              onSizeChange={qs.setSize}
            />
          ) : null
        }
      >
        {!result.ok ? (
          <AdminErrorState ko={ko} code={result.error ?? "load_failed"} httpStatus={500} onRetry={() => router.refresh()} />
        ) : result.rows.length === 0 ? (
          <AdminEmptyState
            ko={ko}
            message={isFiltered ? undefined : EMPTY_TEXT[filters.tab]}
            onReset={isFiltered ? () => qs.reset(["status"]) : undefined}
          />
        ) : (
          <CommunityTable head={["대상", "사유", "신고자", "접수", "상태", "처리"]}>
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
                  <span className="font-medium text-sam-fg">{REASON_LABEL[r.reason_type] ?? "기타"}</span>
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
        <CommunityDrawer title="모임 신고 처리" onClose={() => setOpenId("")}>
          <div className="space-y-4">
            <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />
            <CommunitySection title="신고 대상">
              <CommunitySummaryCard
                rows={[
                  {
                    label: "모임",
                    value: meetingHref(open.meeting_id) ? (
                      <Link href={meetingHref(open.meeting_id) as string} className="font-medium text-sam-info hover:underline">
                        {open.meeting_title?.trim() || "모임 보기"}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  { label: "대상", value: <TargetCell r={open} ko={ko} /> },
                  { label: "사유", value: REASON_LABEL[open.reason_type] ?? "기타" },
                  {
                    label: "신고 내용",
                    value: <span className="whitespace-pre-wrap">{open.reason_detail?.trim() || "—"}</span>,
                  },
                  {
                    label: "신고자",
                    value: (
                      <CommunityAuthorCell userId={open.reporter_user_id || null} nickname={open.reporter?.nickname} handle={open.reporter?.handle} />
                    ),
                  },
                  { label: "접수 시각", value: PHT(open.created_at) },
                  { label: "신고 상태", value: <CommunityStatusBadge domain="meeting_report_status" value={open.status} ko={ko} /> },
                ]}
              />
            </CommunitySection>
            <CommunitySection title="처리 기록">
              <CommunityTimeline
                items={
                  open.reviewed_at
                    ? [
                        {
                          id: open.id,
                          at: open.reviewed_at,
                          actor: open.reviewed_by_label ?? "관리자",
                          action: adminCommunityLabel("meeting_report_status", open.status, ko).label,
                          reason: open.action_result,
                        },
                      ]
                    : []
                }
              />
            </CommunitySection>
            <CommunitySection title="처리">
              {!canModerate ? <p className="text-[13px] text-sam-muted">권한 필요: 신고 처리</p> : null}
              {canModerate && (open.status === "resolved" || open.status === "rejected") && !isSuperAdmin ? (
                <p className="text-[13px] text-sam-muted">처리가 끝난 신고입니다. 다시 열기는 최고 관리자만 할 수 있습니다.</p>
              ) : null}
              {actionsFor(open)}
            </CommunitySection>
            <AdminTechDetails ko={ko}>
              <div>신고 ID: {open.id}</div>
              <div>대상: {open.target_type} / {open.target_id}</div>
              {open.meeting_id ? <div>모임 ID: {open.meeting_id}</div> : null}
              <div>상태 값: {open.status}</div>
            </AdminTechDetails>
          </div>
        </CommunityDrawer>
      ) : null}

      {sheet ? (
        <CommunityActionSheet
          key={`${sheet.kind}:${sheet.row.id}`}
          title={sheet.kind === "resolve" ? "신고 인정" : sheet.kind === "reject" ? "신고 기각" : "다시 열기"}
          rows={sheetRows(sheet.row)}
          notice={
            sheet.kind === "reopen"
              ? "신고를 다시 접수 상태로 돌립니다."
              : sheet.kind === "resolve"
                ? "모임 자체의 조치(종료·회원 내보내기)는 모임 화면에서 따로 합니다. 사유는 처리 기록에 남습니다."
                : "기각하면 모임·회원에게 변화가 없습니다. 사유는 처리 기록에 남습니다."
          }
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "처리 사유" }}
          confirmLabel={sheet.kind === "resolve" ? "신고 인정" : sheet.kind === "reject" ? "신고 기각" : "다시 열기"}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
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
              sheet.kind === "resolve" ? "신고를 인정했습니다." : sheet.kind === "reject" ? "신고를 기각했습니다." : "신고를 다시 열었습니다."
            )
          }
        />
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}
