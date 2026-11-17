"use client";

/**
 * 앱 진입 어드민 v3 §6 (Owner 2026-11-17 「v3대로 진행」) — 팝업 목록: 한 줄로 「앱에 나오나 · 왜 안 나오나」.
 * - 위: 전체 설정(켜기 · 진입당 개수 · 가로 화면) — `AdminPlatformPopupEntryPolicyCard`
 * - 거르기: 전체 / 앱에 나오는 중 / 승인 대기 / 안 나옴 + 형태 ▾ (8종 각각) + 영역 ▾
 * - 「앱에 나오나」 = 서버가 앱 조회와 같은 자격 함수로 계산(`lib/platform-popup/admin-applied-status.ts`). 화면에서 따로 계산하지 않는다.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupEntryPolicyCard } from "@/components/admin/platform-popup/AdminPlatformPopupEntryPolicyCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { ADMIN_DOMAIN_SCOPE_QUERY_KEY } from "@/lib/admin/list-query/admin-domain-scope";
import {
  PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
  PLATFORM_POPUP_NOT_SHOWN_STATUS_FILTER,
} from "@/lib/platform-popup/admin-list-filter";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import { formatPromotionAdminSchedule } from "@/lib/admin/promotion-operation-status";
import {
  popupDestinationSummary,
  popupEditHref,
  popupSurfaceOperatorLabel,
  resolvePopupListCompositionLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import { AdminManagementSelectionCheckbox } from "@/components/admin/management/AdminManagementSelectionCheckbox";
import { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";
import {
  selectionHeaderState,
  toggleCurrentPageSelection,
  toggleRowSelection,
} from "@/lib/admin/management/selection";
import { adminOperatorRowClassFromPromotionStatus } from "@/lib/admin/admin-operator-row-presentation";
import {
  PLATFORM_POPUP_COMPOSITIONS,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  platformPopupAppliedOperatorStatus,
  platformPopupAppliedReasonKey,
  platformPopupAppliedStateKey,
  platformPopupAppliedTone,
  type PlatformPopupAppliedStatus,
} from "@/lib/platform-popup/admin-applied-status-contract";
import { popupCompositionGlyph, popupCompositionShortLabelKey } from "@/lib/platform-popup/admin-composition-ui";
import { AdminDomainScopeSelect } from "@/components/admin/ui/AdminDomainScopeSelect";
import { translateBy } from "@/lib/i18n/translate-by";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

/**
 * 목록 조건 (주소 보존) — 상태(`live` = 앱에 나오는 중 · `not_shown` = 안 나옴 · DB 상태값) · 팝업 형태 · 도메인(G-06 `?domain=`).
 * 대시보드 딥링크 `?status=live` · 도메인 업무 화면 딥링크 `?domain=delivery|trade|community`.
 */
const POPUP_LIST_QUERY_CONFIG = {
  statuses: PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  extras: ["composition", ADMIN_DOMAIN_SCOPE_QUERY_KEY] as const,
};

/** v3 §6 거르기 칩 — 전체 / 앱에 나오는 중 / 승인 대기 / 안 나옴 */
const STATUS_CHIPS = [
  { value: "", key: "admin_popup_v3_filter_all" },
  { value: PLATFORM_POPUP_LIVE_STATUS_FILTER, key: "admin_popup_v3_filter_live" },
  { value: "pending_review", key: "admin_popup_v3_filter_pending" },
  { value: PLATFORM_POPUP_NOT_SHOWN_STATUS_FILTER, key: "admin_popup_v3_filter_not_shown" },
] as const;

const TH = "whitespace-nowrap px-3 py-2 font-semibold";
const TD = "px-3 py-2 align-top";

function isPopupDraftDeletable(item: PlatformPopupAdminListItem): boolean {
  return (
    !item.ownerStoreId &&
    !item.ownerRequestId &&
    (item.status === "draft" || item.status === "pending_review")
  );
}

export function AdminPlatformPopupListPage() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const ko = lang !== "en";
  const lq = useAdminListQuery<"composition" | typeof ADMIN_DOMAIN_SCOPE_QUERY_KEY>(POPUP_LIST_QUERY_CONFIG);
  /** G-18: 팝업 캠페인 쓰기 = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminWriteGuard("/admin/platform-popup");
  const status = lq.query.status;
  const compositionFilter = lq.query.extras.composition;
  const [items, setItems] = useState<PlatformPopupAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const { apiQueryString, refreshKey, refresh } = lq;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailure(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-popup-campaigns?${apiQueryString}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: PlatformPopupAdminListItem[];
          total?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          // 실패 시 직전 목록은 유지하고 오류만 표시
          setLoadFailure({ code: json.error || "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.items ?? [];
        setItems(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setLoaded(true);
        setSelectedIds(new Set());
      } catch {
        if (!cancelled) setLoadFailure({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = apiQueryString + 새로고침 횟수
  }, [apiQueryString, refreshKey]);

  const title = safeT("admin_menu_promotion_popup");

  const onCreate = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeT("admin_platform_popup_untitled"),
        surfaces: ["GLOBAL"],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
    };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(translateBy(lang, "admin_could_not_create_campaign"));
      return;
    }
    // v3 §4: 새 팝업은 형태 고르기부터
    router.push(`${popupEditHref(json.id)}?new=1`);
  };

  /** 형태·상태 필터는 서버에서 적용 (`composition`·`status` → API) — 현재 쪽 행이 곧 표시 행 */
  const visibleItems = items;
  const deletableIds = useMemo(
    () => visibleItems.filter(isPopupDraftDeletable).map((i) => i.id),
    [visibleItems]
  );
  const headerSelectState = selectionHeaderState(selectedIds, deletableIds);

  const onBulkDelete = async () => {
    const ids = [...selectedIds].filter((id) => deletableIds.includes(id));
    if (ids.length === 0) return;
    const titles = ids
      .map((id) => visibleItems.find((i) => i.id === id)?.name?.trim())
      .filter(Boolean) as string[];
    const msg =
      ids.length === 1
        ? translateBy(lang, "admin_popup_delete_one_confirm", {
            title: titles[0] || translateBy(lang, "admin_popup_delete_one_default_title"),
          })
        : translateBy(lang, "admin_delete_length_selected_popup_campaigns_this", { length: ids.length });
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(ids.length > 1 ? "bulk" : "delete"),
      ko,
      title: t("admin_platform_popup_delete_popup_campaigns"),
      description: msg,
      confirmLabel: adminCta("delete", ko),
      destructive: true,
      // 재입력 제거(Owner 2026-11-07): 삭제·일괄 삭제 = 사유만
    });
    if (!confirmed.ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-popup-campaigns/bulk-delete-draft", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason: confirmed.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rejectedId?: string | null;
        deletedIds?: string[];
        failed?: Array<{ id: string; error: string }>;
      };
      if (!res.ok || !json.ok) {
        // AL-20: 1건씩 지우다 중간에 실패하면 지운 수·실패 수를 그대로 알린다(일부 삭제를 숨기지 않음)
        const deletedCount = json.deletedIds?.length ?? 0;
        const failedCount = json.failed?.length ?? 0;
        setError(
          deletedCount > 0
            ? translateBy(lang, "admin_deleted_deletedcount_failed_failedcount_check_th", { deletedCount, failedCount })
            : translateBy(lang, "admin_could_not_delete_v1_none_deleted", { v1: formatPlatformPopupAdminError(json.error || "delete_failed", lang) })
        );
        setSelectedIds(new Set());
        refresh();
        return;
      }
      setSelectedIds(new Set());
      refresh();
    } finally {
      setDeleting(false);
    }
  };

  /** 관리 — 정지(노출·예약 중) · 승인(승인 대기). 상세와 같은 전이 API · 같은 확인 단계 */
  const onRowAction = async (item: PlatformPopupAdminListItem, kind: "pause" | "approve") => {
    const name = item.name?.trim() || item.id;
    const confirmed =
      kind === "pause"
        ? await confirmAdminAction({
            level: adminActionLevel("pause"),
            ko,
            title: t("admin_platform_popup_stop_popup_exposure"),
            description: t("admin_platform_popup_stop_showing_name_can_resume", { name }),
            confirmLabel: adminCta("exposeStop", ko),
          })
        : await confirmAdminAction({
            level: adminActionLevel("approve"),
            ko,
            title: t("admin_platform_popup_approve_popup_scheduled"),
            description: t("admin_platform_popup_quoted_name", { name }),
            confirmLabel: adminCta("approve", ko),
          });
    if (!confirmed.ok) return;
    const body =
      kind === "pause"
        ? { action: "transition", nextStatus: "paused" }
        : { action: "approve", schedule: true };
    setActingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/platform-popup-campaigns/${encodeURIComponent(item.id)}/transition`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmed.reason ? { ...body, reason: confirmed.reason } : body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(formatPlatformPopupAdminError(json.error || "transition_failed", lang));
        return;
      }
      refresh();
    } finally {
      setActingId(null);
    }
  };

  const appliedCell = (applied: PlatformPopupAppliedStatus | undefined) => {
    if (!applied) return <span className="text-[12px] text-sam-muted">—</span>;
    const reasonKey = platformPopupAppliedReasonKey(applied);
    const reasonText = reasonKey
      ? safeT(reasonKey, {
          vars: { at: applied.startsAt ? formatPromotionAdminSchedule(applied.startsAt, lang) : "" },
        })
      : null;
    return (
      <div className="flex flex-col items-start gap-1" data-admin-popup-applied={applied.state}>
        <AdminToneBadge tone={platformPopupAppliedTone(applied.state)}>
          <span data-admin-popup-op-status="1">{safeT(platformPopupAppliedStateKey(applied.state))}</span>
        </AdminToneBadge>
        {reasonText ? (
          <span
            className={`max-w-[200px] text-[12px] ${applied.state === "not_shown" ? "text-sam-danger" : "text-sam-muted"}`}
            data-admin-popup-applied-reason={applied.reason ?? ""}
          >
            {reasonText}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4" data-admin-platform-popup-list="1">
      <AdminPageHeader
        title={title}
        description={safeT("admin_platform_popup_list_desc")}
      />

      <AdminPlatformPopupEntryPolicyCard canWrite={adminAction.allowed} />

      <div className="flex flex-wrap items-center gap-2" data-admin-popup-v3-filters="1">
        {STATUS_CHIPS.map((chip) => (
          <AdminChipButton
            key={chip.key}
            selected={status === chip.value}
            onClick={() => lq.setStatus(chip.value)}
            data-admin-popup-status-chip={chip.value || "all"}
          >
            {t(chip.key)}
          </AdminChipButton>
        ))}
        <select
          aria-label={safeT("admin_platform_popup_filter_composition")}
          className="h-8 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2 text-[13px] text-[var(--admin-console-fg)]"
          value={compositionFilter}
          onChange={(e) => lq.setExtra("composition", e.target.value)}
          data-admin-popup-filter-composition="1"
        >
          <option value="">{t("admin_popup_v3_filter_composition_all")}</option>
          {/* v3 ④: 8종 각각 다른 선택지 — 예전에는 새 형태 4종이 「중앙 모달」로 묶였다 */}
          {PLATFORM_POPUP_COMPOSITIONS.map((c) => (
            <option key={c} value={c}>
              {t(popupCompositionShortLabelKey(c))}
            </option>
          ))}
        </select>
        <AdminDomainScopeSelect
          ko={ko}
          value={lq.query.extras.domain}
          onChange={(v) => lq.setExtra(ADMIN_DOMAIN_SCOPE_QUERY_KEY, v)}
          includesGlobalNote
        />
        <div className="ml-auto flex items-center gap-2">
          {!adminAction.allowed && adminAction.reason ? (
            <span className="text-[12px] text-sam-muted" data-admin-action-denied="1">
              {adminAction.reason}
            </span>
          ) : null}
          <AdminActionButton
            variant="primary"
            disabled={creating || !adminAction.allowed}
            title={adminAction.reason ?? undefined}
            onClick={() => void onCreate()}
          >
            {t("admin_popup_v3_new")}
          </AdminActionButton>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-sam-danger" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard>
        {deletableIds.length > 0 ? (
          <div
            className="mb-3 flex flex-wrap items-center gap-3 border-b border-sam-border pb-3"
            data-admin-popup-bulk-toolbar="1"
          >
            <AdminManagementSelectionCheckbox
              role="header"
              state={headerSelectState}
              onToggle={() =>
                setSelectedIds((prev) => toggleCurrentPageSelection(prev, deletableIds))
              }
              aria-label={translateBy(lang, "admin_select_all_deletable_drafts")}
            />
            <span className="text-sm text-sam-muted">
              {translateBy(lang, "admin_size_selected", { size: selectedIds.size })}
            </span>
            <AdminActionButton
              variant="danger"
              size="sm"
              disabled={deleting || selectedIds.size === 0 || !adminAction.allowed}
              title={adminAction.reason ?? undefined}
              onClick={() => void onBulkDelete()}
              data-admin-popup-bulk-delete="1"
            >
              {adminCta("delete", ko)}
            </AdminActionButton>
            <span className="text-[12px] text-sam-muted">
              {translateBy(lang, "admin_only_admin_direct_drafts_can_be")}
            </span>
          </div>
        ) : null}
        {loadFailure ? (
          <AdminErrorState
            ko={ko}
            code={loadFailure.code}
            httpStatus={loadFailure.httpStatus}
            onRetry={refresh}
          />
        ) : null}
        {loading && !loaded ? (
          <AdminLoadingState
            ko={ko}
            label={safeT("admin_platform_popup_loading")}
          />
        ) : !loaded ? null : items.length === 0 && lq.isFiltered ? (
          <AdminEmptyState
            ko={ko}
            message={
              compositionFilter && !status
                ? safeT("admin_platform_popup_filter_empty")
                : undefined
            }
            onReset={lq.reset}
          />
        ) : items.length === 0 ? (
          <AdminEmptyState
            ko={ko}
            message={safeT("admin_platform_popup_empty")}
            action={
              <AdminActionButton
                variant="primary"
                size="sm"
                disabled={creating || !adminAction.allowed}
                title={adminAction.reason ?? undefined}
                onClick={() => void onCreate()}
                data-admin-popup-empty-create="1"
              >
                {t("admin_platform_popup_create_2")}
              </AdminActionButton>
            }
          />
        ) : (
          <>
          <AdminManagementTableViewport>
          <table className="min-w-full border-collapse text-[13px]" data-admin-popup-operational-list="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
                <th className={TH}>
                  <span className="sr-only">{translateBy(lang, "admin_dev_sprint_select_sprint")}</span>
                </th>
                <th className={TH}>{t("admin_popup_v3_col_image")}</th>
                <th className={TH}>{t("admin_popup_v3_col_name")}</th>
                <th className={TH}>{t("admin_popup_v3_col_composition")}</th>
                <th className={TH}>{t("admin_popup_v3_col_queue")}</th>
                <th className={TH}>{t("admin_popup_v3_col_auto_dismiss")}</th>
                <th className={TH}>{t("admin_popup_v3_col_surfaces")}</th>
                <th className={TH}>{t("admin_popup_v3_col_period")}</th>
                <th className={TH}>{t("admin_popup_v3_col_destination")}</th>
                <th className={TH}>{t("admin_popup_v3_col_applied")}</th>
                <th className={TH}>{t("admin_popup_v3_col_recent")}</th>
                <th className={`${TH} text-right`}>{translateBy(lang, "admin_posts_col_manage")}</th>
              </tr>
            </thead>
            <tbody>
            {visibleItems.map((item) => {
              const applied = item.appliedStatus;
              const op = applied ? platformPopupAppliedOperatorStatus(applied) : "DRAFT";
              const composition = resolvePlatformPopupComposition({
                presentationType: item.presentationType,
                creativeMode: item.creativeMode,
              });
              const surfaces = item.surfaces
                .map((s) => popupSurfaceOperatorLabel(s, lang))
                .join(" · ");
              const canPause = item.status === "active" || item.status === "scheduled";
              const canApprove = item.status === "pending_review";
              const recent = item.recent30d;
              return (
                <tr
                  key={item.id}
                  className={`border-b border-sam-border last:border-b-0 ${adminOperatorRowClassFromPromotionStatus(op)}`}
                  data-admin-popup-composition={resolvePopupListCompositionLabel({
                    presentationType: item.presentationType,
                    creativeMode: item.creativeMode,
                    lang,
                  })}
                  data-admin-popup-composition-kind={composition}
                  data-admin-op-status={op}
                >
                  <td className={TD}>
                    <div className="pt-1">
                      <AdminManagementSelectionCheckbox
                        role="row"
                        checked={selectedIds.has(item.id)}
                        disabled={!isPopupDraftDeletable(item)}
                        onToggle={() => {
                          if (!isPopupDraftDeletable(item)) return;
                          setSelectedIds((prev) => toggleRowSelection(prev, item.id));
                        }}
                        aria-label={translateBy(lang, "admin_select_name", { name: item.name })}
                      />
                    </div>
                  </td>
                  <td className={TD}>
                    {item.creativeThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin list thumb
                      <img
                        src={item.creativeThumbUrl}
                        alt=""
                        className="h-9 w-12 shrink-0 rounded-ui-rect object-cover"
                      />
                    ) : (
                      <span className="block h-9 w-12 shrink-0 rounded-ui-rect bg-sam-app" />
                    )}
                  </td>
                  <td className={`${TD} min-w-[160px]`}>
                    <Link href={popupEditHref(item.id)} className="text-[14px] font-semibold hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[12px]`} data-admin-popup-form-label="1">
                    <span aria-hidden className="mr-1 text-sam-muted">
                      {popupCompositionGlyph(composition)}
                    </span>
                    {t(popupCompositionShortLabelKey(composition))}
                  </td>
                  <td className={TD}>
                    <AdminToneBadge tone={item.queueClass === "mandatory" ? "progress" : "neutral"}>
                      <span data-admin-popup-queue-class={item.queueClass}>
                        {t(item.queueClass === "mandatory" ? "admin_popup_v3_queue_first" : "admin_popup_v3_queue_normal")}
                      </span>
                    </AdminToneBadge>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[12px] text-sam-muted`}>
                    {item.autoDismissSeconds
                      ? t("admin_popup_v3_seconds", { seconds: item.autoDismissSeconds })
                      : t("admin_popup_v3_none")}
                  </td>
                  <td className={`${TD} text-[12px] text-sam-muted`}>{surfaces || "—"}</td>
                  <td className={`${TD} whitespace-nowrap text-[12px] text-sam-muted`}>
                    {item.startAt || item.endAt
                      ? `${formatPromotionAdminSchedule(item.startAt, lang)} ~ ${item.endAt ? formatPromotionAdminSchedule(item.endAt, lang) : ""}`
                      : t("admin_popup_v3_always")}
                  </td>
                  <td className={`${TD} text-[12px] text-sam-muted`}>
                    {popupDestinationSummary({
                      ctaType: item.ctaType,
                      ctaTarget: item.ctaTarget,
                      externalUrl: item.externalUrl,
                      lang,
                    })}
                  </td>
                  <td className={TD}>{appliedCell(applied)}</td>
                  <td className={`${TD} whitespace-nowrap text-[12px] text-sam-muted`} data-admin-popup-recent30d="1">
                    {recent && recent.impressions > 0
                      ? t("admin_popup_v3_recent", {
                          impressions: formatAdminNumber(recent.impressions),
                          rate: ((recent.clicks / recent.impressions) * 100).toFixed(1),
                        })
                      : "—"}
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <AdminActionLink href={popupEditHref(item.id)} variant="secondary" size="sm">
                        {safeT("admin_promotion_action_edit")}
                      </AdminActionLink>
                      {canPause ? (
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          disabled={actingId === item.id || !adminAction.allowed}
                          title={adminAction.reason ?? undefined}
                          onClick={() => void onRowAction(item, "pause")}
                          data-admin-popup-row-pause="1"
                        >
                          {t("admin_popup_v3_action_pause")}
                        </AdminActionButton>
                      ) : canApprove ? (
                        <AdminActionButton
                          variant="primary"
                          size="sm"
                          disabled={actingId === item.id || !adminAction.allowed}
                          title={adminAction.reason ?? undefined}
                          onClick={() => void onRowAction(item, "approve")}
                          data-admin-popup-row-approve="1"
                        >
                          {t("admin_popup_v3_action_approve")}
                        </AdminActionButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
          </AdminManagementTableViewport>
          <p className="mt-3 rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted" data-admin-popup-applied-note="1">
            {t("admin_popup_v3_applied_note")}
          </p>
          <AdminPagination
            ko={ko}
            page={lq.query.page}
            size={lq.query.size}
            total={total}
            onPageChange={lq.setPage}
            onSizeChange={lq.setSize}
            disabled={loading}
          />
          </>
        )}
      </AdminCard>
    </div>
  );
}
