"use client";

/**
 * 충전 신청 (설계 §C-14 · §F-3) — 공통 충전 API 를 그대로 쓰는 전체 회원 충전 신청 목록.
 * 목록: 회원·요금제·포인트·결제 금액·상태·신청 시각. 입금자명·증빙·회원 메모는 상세 시트에서만.
 * 처리: 「입금 확인 후 승인」(확인 근거 필수 L2) · 「보류」(L1) · 「반려」(사유 필수 L2) — runPointChargeAction.
 * URL: status=pending|on_hold|approved|rejected|all · q(닉네임·입금자명·신청 번호) · chargeId(시트 바로 열기) · page · size(20/50/100)
 * 상태 필터·검색·페이지는 서버(`/api/admin/point-charges`)가 처리 — 300건 상한 없음, `total`·`statusCounts` 는 정확한 건수.
 * C-3 (H-10 · Owner 2026-11-03): 기간 from/to(PHT, 신청 시각) — 목록·탭 건수에 적용하고, 기간 **전체** 합계
 * (`periodSummary` · 서버 계산 · 탭·검색·쪽과 무관)를 `AdminRequestPeriodSummaryLine` 으로 보여 준다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { runPointChargeAction, type PointChargeAction } from "@/components/admin/points/point-charge-action-client";
import type { PointChargeRequest } from "@/lib/types/point";
import { AdminRequestPeriodSummaryLine } from "@/components/admin/finance/AdminRequestPeriodSummaryLine";
import type { AdminRequestPeriodSummary } from "@/lib/admin/finance/admin-request-period-summary";
import { pointChargesListPeriodDates } from "@/lib/admin/community-admin/point-charges-list-period";
import {
  formatCommunityPeso,
  formatCommunityPoints,
  useCommunityAdminAccess,
  useCommunityAdminJson,
  type CommunityBannerState,
} from "@/components/admin/community/members/use-community-admin-data";

const TAB_STATUSES: Record<string, readonly string[] | null> = {
  pending: ["pending", "waiting_confirm"],
  on_hold: ["on_hold"],
  approved: ["approved"],
  rejected: ["rejected"],
  all: null,
};

const TAB_KEYS = Object.keys(TAB_STATUSES);

const OPEN_STATUSES = new Set(["pending", "waiting_confirm", "on_hold"]);

const PAYMENT_METHOD: Record<string, MessageKey> = {
  bank_transfer: "admin_community_charges_method_bank_transfer",
  gcash: "admin_community_charges_method_gcash",
  manual_confirm: "admin_community_charges_method_manual_confirm",
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  requests?: PointChargeRequest[];
  total?: number;
  statusCounts?: Partial<Record<PointChargeRequest["requestStatus"], number>>;
  periodSummary?: AdminRequestPeriodSummary | null;
  periodNotAppliedToSearch?: boolean;
};
type DetailResponse = { ok?: boolean; error?: string; request?: PointChargeRequest };

const abs = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

/** 화면 범위 — 커뮤니티(기본) · 거래 (거래 Admin O-2: 활성 관리자 전원, 같은 공용 처리) */
export type PointChargesScope = "community" | "trade";
const SCOPE_PATHS: Record<PointChargesScope, { api: string; member: string; support: string }> = {
  community: { api: "/api/admin/point-charges", member: "/admin/community/members/", support: "/admin/community/support" },
  trade: { api: "/api/admin/trade/point-charges", member: "/admin/trade/members/", support: "/admin/trade/support" },
};

export function AdminCommunityPointChargesPage({ scope = "community" }: { scope?: PointChargesScope } = {}) {
  const { t } = useI18n();
  /** `chargeId`(시트 바로 열기)는 조회 조건 밖 키 */
  const q = useCommunityQueryState();
  const lq = useCommunityListQuery({ statuses: TAB_KEYS, defaults: { status: "pending" }, keepOnReset: { status: true } });
  const access = useCommunityAdminAccess();
  const paths = SCOPE_PATHS[scope];
  const status = lq.query.status in TAB_STATUSES ? lq.query.status : "all";
  const [openId, setOpenId] = useState<string | null>(() => q.get("chargeId") || null);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const listUrl = useMemo(() => {
    const params = lq.apiParams({ period: false });
    params.set("counts", "1");
    params.set("summary", "1");
    const dates = pointChargesListPeriodDates({ legacyPeriod: lq.legacyPeriod, from: lq.query.from, to: lq.query.to });
    if (dates.from) params.set("from", dates.from);
    if (dates.to) params.set("to", dates.to);
    const st = TAB_STATUSES[status];
    params.set("status", st ? st.join(",") : "all");
    return `${paths.api}?${params.toString()}`;
  }, [lq, status, paths.api]);
  const { state, reload } = useCommunityAdminJson<ListResponse>(listUrl);

  const pageRows = useMemo(() => state.data?.requests ?? [], [state]);
  const total = state.status === "ok" ? state.data.total ?? pageRows.length : null;
  const statusCounts = state.status === "ok" ? state.data.statusCounts ?? null : null;
  /** 탭 배지 — 검색과 무관한 상태별 전체 건수 (서버 exact count). */
  const countOf = (tab: string): number | null => {
    if (!statusCounts) return null;
    const st = TAB_STATUSES[tab];
    const keys = st ?? (Object.keys(statusCounts) as PointChargeRequest["requestStatus"][]);
    return keys.reduce((n, k) => n + (statusCounts[k as PointChargeRequest["requestStatus"]] ?? 0), 0);
  };
  const loaded = state.status === "ok";
  /** 기간 합계 — 불러오는 중·실패면 이전 조건 값을 보이지 않는다. */
  const periodSummary = state.status === "ok" ? state.data.periodSummary ?? null : null;
  const periodNotAppliedToSearch = state.status === "ok" && state.data.periodNotAppliedToSearch === true;

  return (
    <CommunityListShell
      title={t("admin_community_charges_title")}
      description={t("admin_community_charges_desc")}
      banner={
        <div className="space-y-2">
          <p
            data-community-charge-scope="all-members"
            className="rounded-ui-rect border border-sam-info bg-sam-info-soft px-3 py-2 text-[13px] font-medium text-sam-fg"
          >
            {t("admin_community_charges_scope_note")}
          </p>
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
        </div>
      }
      tabs={
        <CommunityTabs
          value={status}
          onChange={(v) => lq.setStatus(v)}
          tabs={[
            { value: "pending", label: t("admin_community_charges_tab_pending"), count: loaded ? countOf("pending") : null },
            { value: "on_hold", label: t("admin_community_charges_tab_on_hold"), count: loaded ? countOf("on_hold") : null },
            { value: "approved", label: t("admin_community_charges_tab_approved"), count: loaded ? countOf("approved") : null },
            { value: "rejected", label: t("admin_community_charges_tab_rejected"), count: loaded ? countOf("rejected") : null },
            { value: "all", label: t("admin_community_charges_tab_all"), count: loaded ? countOf("all") : null },
          ]}
        />
      }
      filterBar={
        <div className="space-y-2">
          <CommunityFilterBar lq={lq} searchPlaceholder={t("admin_community_charges_search_placeholder")} pending={state.status === "loading"} requireCompletePeriod />
          <AdminRequestPeriodSummaryLine
            ko
            summary={periodSummary}
            formatAmount={(n) => formatCommunityPoints(n)}
            formatAmount2={(n) => formatCommunityPeso(n)}
            note={
              periodNotAppliedToSearch
                ? t("admin_community_charges_period_not_applied")
                : null
            }
          />
        </div>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={pageRows.length === 0}
        lq={lq}
        onRetry={reload}
        emptyMessage={t("admin_community_charges_list_empty")}
      >
        <CommunityTable head={[
          t("admin_community_charges_th_member"),
          t("admin_community_charges_th_plan_points"),
          t("admin_community_charges_th_payment"),
          t("admin_community_charges_th_status"),
          t("admin_community_charges_th_requested_processed"),
          "",
        ]}>
          {pageRows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app" onClick={() => setOpenId(r.id)}>
              <td className={COMMUNITY_TD}>
                <Link
                  href={communityDetailHref(`${paths.member}${encodeURIComponent(r.userId)}`, q.selfHref)}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-sam-primary hover:underline"
                >
                  {r.userNickname?.trim() || t("admin_community_charges_no_name")}
                </Link>
              </td>
              <td className={COMMUNITY_TD}>
                {r.planName || "—"}
                <div className="text-[12px] text-sam-muted">{formatCommunityPoints(r.pointAmount)}</div>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPeso(r.paymentAmount)}</td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="charge_status" value={r.requestStatus} />
                {/* R6-g — 반려 사유를 목록 줄에 바로 */}
                {r.requestStatus === "rejected" ? (
                  <div className="mt-1 max-w-[14rem] break-words text-[12px] text-sam-fg" data-community-charge-reject-reason="1">
                    {t("admin_community_charges_reject_reason", { reason: r.rejectReason?.trim() || "—" })}
                  </div>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                {/* R6 — 연도 포함 PHT 신청·처리 시각 (상대 시각 「n분 전」 대신) */}
                <div className="text-[12px]">
                  {t("admin_community_charges_requested_at")} <CommunityTimeCell iso={r.requestedAt} absolute />
                </div>
                {r.processedAt || r.approvedAt ? (
                  <div className="text-[12px] text-sam-muted" data-community-charge-processed-at="1">
                    {t("admin_community_charges_processed_at")} <CommunityTimeCell iso={r.processedAt ?? r.approvedAt} absolute />
                  </div>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionButton variant="ghost" onClick={() => setOpenId(r.id)}>
                  {t("admin_community_charges_details")}
                </AdminActionButton>
              </td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>

      {openId ? (
        <ChargeSheet
          id={openId}
          paths={paths}
          canAct={scope === "trade" ? true : access.allowed("points")}
          deniedTitle={scope === "trade" ? undefined : access.deniedTitle("points")}
          onClose={() => {
            setOpenId(null);
            if (q.get("chargeId")) q.set({ chargeId: null }, { keepPage: true });
          }}
          onDone={(result) => {
            setOpenId(null);
            if (q.get("chargeId")) q.set({ chargeId: null }, { keepPage: true });
            setBanner(result);
            reload();
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}

function ChargeSheet({
  id,
  paths,
  canAct,
  deniedTitle,
  onClose,
  onDone,
}: {
  id: string;
  paths: { api: string; member: string; support: string };
  canAct: boolean;
  deniedTitle?: string;
  onClose: () => void;
  onDone: (banner: CommunityBannerState) => void;
}) {
  const { t } = useI18n();
  const { state, reload } = useCommunityAdminJson<DetailResponse>(`${paths.api}/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState<PointChargeAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = state.status === "ok" ? state.data.request ?? null : null;
  const open = r ? OPEN_STATUSES.has(r.requestStatus) : false;

  const act = async (action: PointChargeAction) => {
    if (!r || busy) return;
    setBusy(action);
    setError(null);
    try {
      const out = await runPointChargeAction({
        requestId: r.id,
        action,
        ko: true,
        apiBase: paths.api,
        summary: t("admin_community_charges_action_summary", {
          name: r.userNickname || t("admin_community_charges_member"),
          points: formatAdminNumber(r.pointAmount),
          amount: formatAdminPhp(r.paymentAmount),
          depositor: r.depositorName || "-",
        }),
      });
      if (!out.ok) {
        if (out.cancelled) return;
        if (out.error === "already_processed" || out.error === "stale_state" || out.error === "conflict") {
          onDone({ ok: true, message: t("admin_community_post_stale") });
          return;
        }
        setError(out.error);
        return;
      }
      onDone({
        ok: true,
        message:
          action === "approve"
            ? t("admin_community_charges_approved_msg")
            : action === "reject"
              ? t("admin_community_charges_rejected_msg")
              : t("admin_community_charges_held_msg"),
      });
    } finally {
      setBusy(null);
    }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <AdminActionButton variant="neutral" disabled={Boolean(busy)} onClick={onClose}>
        {t("admin_community_charges_sheet_close")}
      </AdminActionButton>
      {r && open ? (
        <div className="flex flex-wrap gap-2">
          {r.requestStatus !== "on_hold" ? (
            <AdminActionButton variant="secondary" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("hold")}>
              {busy === "hold" ? t("admin_community_settings_processing") : t("admin_community_charges_tab_on_hold")}
            </AdminActionButton>
          ) : null}
          <AdminActionButton variant="danger" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("reject")}>
            {busy === "reject" ? t("admin_community_settings_processing") : t("admin_community_charges_tab_rejected")}
          </AdminActionButton>
          <AdminActionButton variant="primary" disabled={!canAct || Boolean(busy)} title={deniedTitle} onClick={() => void act("approve")}>
            {busy === "approve" ? t("admin_community_settings_processing") : t("admin_community_charges_approve_btn")}
          </AdminActionButton>
        </div>
      ) : null}
    </div>
  );

  return (
    <AdminFormSheet title={t("admin_community_charges_detail_title")} onClose={busy ? () => undefined : onClose} dismissible={!busy} footer={footer}>
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : r ? (
        <div className="space-y-3">
          {error ? <AdminResultBanner ko result={{ ok: false, code: error }} onClose={() => setError(null)} /> : null}
          <CommunitySummaryCard
            rows={[
              { label: t("admin_community_charges_member"), value: r.userNickname || t("admin_community_charges_no_name") },
              { label: t("admin_community_charges_th_status"), value: <CommunityStatusBadge domain="charge_status" value={r.requestStatus} /> },
              { label: t("admin_community_charges_row_plan"), value: r.planName || "—" },
              { label: t("admin_community_charges_row_points"), value: formatCommunityPoints(r.pointAmount) },
              { label: t("admin_community_charges_th_payment"), value: formatCommunityPeso(r.paymentAmount) },
              {
                label: t("admin_community_charges_row_method"),
                value: PAYMENT_METHOD[r.paymentMethod] ? t(PAYMENT_METHOD[r.paymentMethod]) : t("admin_community_charges_method_other"),
              },
              { label: t("admin_community_charges_row_depositor"), value: r.depositorName || "—" },
              { label: t("admin_community_charges_row_requested"), value: abs(r.requestedAt) },
              { label: t("admin_community_charges_row_processed"), value: abs(r.processedAt ?? r.approvedAt) },
              ...(r.requestStatus === "rejected" ? [{ label: t("admin_community_charges_row_reject_reason"), value: r.rejectReason?.trim() || "—" }] : []),
              { label: t("admin_community_charges_row_user_memo"), value: r.userMemo || "—" },
              { label: t("admin_community_charges_row_admin_memo"), value: r.adminMemo || "—" },
            ]}
          />
          <div>
            <p className="mb-1 text-[13px] font-medium text-sam-fg">{t("admin_community_charges_receipt")}</p>
            {r.receiptImageUrl ? (
              <a href={r.receiptImageUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 회원이 올린 원본 증빙 (외부 저장소 URL) */}
                <img src={r.receiptImageUrl} alt={t("admin_community_charges_receipt")} className="max-h-80 rounded-ui-rect border border-sam-border object-contain" />
              </a>
            ) : (
              <p className="text-[13px] text-sam-muted">{t("admin_community_charges_no_receipt")}</p>
            )}
          </div>
          <p className="text-[13px]">
            <Link
              href={`${paths.support}?status=all&reference_type=POINT_CHARGE_REQUEST&reference_id=${encodeURIComponent(r.id)}`}
              className="text-sam-primary underline"
            >
              {t("admin_community_charges_related_inquiries")}
            </Link>
          </p>
          {!open ? <p className="text-[13px] text-sam-muted">{t("admin_community_charges_already_processed")}</p> : null}
          <AdminTechDetails ko>
            <div>request: {r.id}</div>
            <div>user: {r.userId}</div>
            <div>plan: {r.planId} · rate v{r.rateVersion} · {r.appliedRate}</div>
          </AdminTechDetails>
        </div>
      ) : (
        <AdminEmptyState ko message={t("admin_community_charges_not_found")} />
      )}
    </AdminFormSheet>
  );
}
