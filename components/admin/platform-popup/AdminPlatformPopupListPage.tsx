"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import {
  PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
  platformPopupLiveStatusFilterLabel,
} from "@/lib/platform-popup/admin-list-filter";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolvePopupOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import {
  popupApprovalStatusLabel,
  popupBenefitHintLabel,
  popupDestinationSummary,
  popupEditHref,
  popupFrequencyOperatorLabel,
  popupSurfaceOperatorLabel,
  resolvePopupBenefitOperationalHint,
  resolvePopupListCompositionLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import { AdminManagementSelectionCheckbox } from "@/components/admin/management/AdminManagementSelectionCheckbox";
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

/** 목록 조건 (주소 보존) — 상태(`live` = 지금 노출 중 · DB 상태값) · 팝업 형태. 대시보드 딥링크 `?status=live`. */
const POPUP_LIST_QUERY_CONFIG = {
  statuses: PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  extras: ["composition"] as const,
};
import { platformPopupCampaignStatusLabel } from "@/lib/platform-popup/popup-product-labels";

function isPopupDraftDeletable(item: PlatformPopupAdminListItem): boolean {
  return (
    !item.ownerStoreId &&
    !item.ownerRequestId &&
    (item.status === "draft" || item.status === "pending_review")
  );
}

export function AdminPlatformPopupListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const ko = lang !== "en";
  const lq = useAdminListQuery<"composition">(POPUP_LIST_QUERY_CONFIG);
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

  const title = safeT("admin_menu_promotion_popup", {
    fallbackKo: "팝업",
    fallbackEn: "Popups",
  });

  const onCreate = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeT("admin_platform_popup_untitled", {
          fallbackKo: "새 팝업 캠페인",
          fallbackEn: "New popup campaign",
        }),
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
      setError(
        lang === "en" ? "Could not create campaign." : "캠페인을 만들지 못했습니다."
      );
      return;
    }
    router.push(popupEditHref(json.id));
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
        ? lang === "en"
          ? `Delete '${titles[0] || "this draft popup"}'? This cannot be undone.`
          : `'${titles[0] || "팝업 캠페인"}'을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`
        : lang === "en"
          ? `Delete ${ids.length} selected popup campaigns? This cannot be undone.`
          : `선택한 ${ids.length}개 팝업 캠페인을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(ids.length > 1 ? "bulk" : "delete"),
      ko,
      title: ko ? "팝업 캠페인 삭제" : "Delete popup campaigns",
      description: msg,
      confirmLabel: adminCta("delete", ko),
      destructive: true,
      retypeValue:
        ids.length === 1
          ? titles[0] || ids[0]
          : ko
            ? `${ids.length}개 삭제`
            : `delete ${ids.length}`,
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
      };
      if (!res.ok || !json.ok) {
        setError(
          lang === "en"
            ? `Could not delete: ${formatPlatformPopupAdminError(json.error || "delete_failed", lang)} None deleted.`
            : `삭제하지 못했습니다: ${formatPlatformPopupAdminError(json.error || "delete_failed", lang)} 선택된 항목은 삭제되지 않았습니다.`
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

  return (
    <div className="space-y-4 p-4" data-admin-platform-popup-list="1">
      <AdminPageHeader
        title={title}
        description={safeT("admin_platform_popup_list_desc", {
          fallbackKo:
            "앱 화면 위에 표시되는 프로모션 팝업을 관리합니다. 형태·이벤트·위치·빈도·상태를 확인하세요.",
          fallbackEn:
            "Manage promotion popups over the app. Review form, event, surface, frequency, and status.",
        })}
      />

      <div className="flex justify-end">
        <AdminActionButton
          variant="secondary"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          {safeT("admin_platform_popup_create", {
            fallbackKo: "캠페인 만들기",
            fallbackEn: "Create campaign",
          })}
        </AdminActionButton>
      </div>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        pending={loading}
        status={{
          value: status,
          onChange: lq.setStatus,
          label: safeT("admin_platform_popup_filter_status", {
            fallbackKo: "운영 상태",
            fallbackEn: "Status",
          }),
          options: [
            {
              value: PLATFORM_POPUP_LIVE_STATUS_FILTER,
              label: platformPopupLiveStatusFilterLabel(lang),
            },
            ...PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => ({
              value: s,
              label: platformPopupCampaignStatusLabel(s, lang),
            })),
          ],
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {safeT("admin_platform_popup_filter_composition", {
            fallbackKo: "팝업 형태",
            fallbackEn: "Form",
          })}
          <select
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            value={compositionFilter}
            onChange={(e) => lq.setExtra("composition", e.target.value)}
            data-admin-popup-filter-composition="1"
          >
            <option value="">
              {safeT("admin_platform_popup_filter_all", {
                fallbackKo: "전체",
                fallbackEn: "All",
              })}
            </option>
            {PLATFORM_POPUP_COMPOSITIONS.map((c) => (
              <option key={c} value={c}>
                {resolvePopupListCompositionLabel({
                  presentationType:
                    c === "bottom_promotion_sheet"
                      ? "bottom_sheet"
                      : c === "benefit_dialog"
                        ? "benefit_dialog"
                        : "center_modal",
                  creativeMode: c === "artwork_modal" ? "artwork" : "card",
                  lang,
                })}
              </option>
            ))}
          </select>
        </label>
      </AdminFilterBar>

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
              aria-label={lang === "en" ? "Select all deletable drafts" : "삭제 가능한 초안 전체 선택"}
            />
            <span className="text-sm text-sam-muted">
              {lang === "en"
                ? `${selectedIds.size} selected`
                : `${selectedIds.size}개 선택`}
            </span>
            <AdminActionButton
              variant="danger"
              size="sm"
              disabled={deleting || selectedIds.size === 0}
              onClick={() => void onBulkDelete()}
              data-admin-popup-bulk-delete="1"
            >
              {adminCta("delete", ko)}
            </AdminActionButton>
            <span className="text-[12px] text-sam-muted">
              {lang === "en"
                ? "Only Admin Direct drafts can be deleted. Active rows are protected."
                : "Admin Direct 초안만 삭제 가능. 노출 중 행은 선택되지 않습니다."}
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
            label={safeT("admin_platform_popup_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          />
        ) : !loaded ? null : items.length === 0 && lq.isFiltered ? (
          <AdminEmptyState
            ko={ko}
            message={
              compositionFilter && !status
                ? safeT("admin_platform_popup_filter_empty", {
                    fallbackKo: "선택한 형태에 해당하는 팝업이 없습니다.",
                    fallbackEn: "No popups match this form filter.",
                  })
                : undefined
            }
            onReset={lq.reset}
          />
        ) : items.length === 0 ? (
          <AdminEmptyState
            ko={ko}
            message={safeT("admin_platform_popup_empty", {
              fallbackKo: "등록된 프로모션 팝업이 없습니다.",
              fallbackEn: "No promotion popups yet.",
            })}
          />
        ) : (
          <>
          <ul className="divide-y divide-sam-border" data-admin-popup-operational-list="1">
            {visibleItems.map((item) => {
              const op = resolvePopupOperatorStatus({
                status: item.status,
                startsAt: item.startAt,
                endsAt: item.endAt,
              });
              const compositionLabel = resolvePopupListCompositionLabel({
                presentationType: item.presentationType,
                creativeMode: item.creativeMode,
                lang,
              });
              const benefitHint = resolvePopupBenefitOperationalHint({
                presentationType: item.presentationType,
                creativeMode: item.creativeMode,
                linkedEventId: item.linkedEventId,
                linkedEventHasBenefit: item.linkedEventHasBenefit,
              });
              const benefitLabel = popupBenefitHintLabel(benefitHint, lang);
              const surfaces = item.surfaces
                .map((s) => popupSurfaceOperatorLabel(s, lang))
                .join(", ");
              return (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-2 py-2.5 pl-3 ${adminOperatorRowClassFromPromotionStatus(op)}`}
                  data-admin-popup-composition={compositionLabel}
                  data-admin-popup-composition-kind={resolvePlatformPopupComposition({
                    presentationType: item.presentationType,
                    creativeMode: item.creativeMode,
                  })}
                  data-admin-op-status={op}
                >
                  <div className="flex min-w-0 flex-1 gap-2">
                    <div className="pt-1">
                      <AdminManagementSelectionCheckbox
                        role="row"
                        checked={selectedIds.has(item.id)}
                        disabled={!isPopupDraftDeletable(item)}
                        onToggle={() => {
                          if (!isPopupDraftDeletable(item)) return;
                          setSelectedIds((prev) => toggleRowSelection(prev, item.id));
                        }}
                        aria-label={
                          lang === "en" ? `Select ${item.name}` : `${item.name} 선택`
                        }
                      />
                    </div>
                    {item.creativeThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin list thumb
                      <img
                        src={item.creativeThumbUrl}
                        alt=""
                        className="h-9 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-9 w-12 shrink-0 rounded bg-sam-app" />
                    )}
                    <div className="min-w-0">
                      <Link
                        href={popupEditHref(item.id)}
                        className="text-sm font-semibold hover:underline"
                      >
                        {item.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-sam-muted">
                        <span data-admin-popup-form-label="1">{compositionLabel}</span>
                        {benefitLabel ? (
                          <span className="text-sam-warning" data-admin-popup-benefit-hint="1">
                            {benefitLabel}
                          </span>
                        ) : null}
                        <span>
                          {lang === "en" ? "Event" : "이벤트"}:{" "}
                          {item.linkedEventTitle ||
                            (item.linkedEventId
                              ? item.linkedEventId.slice(0, 8)
                              : lang === "en"
                                ? "—"
                                : "없음")}
                        </span>
                        <span>
                          {lang === "en" ? "Where" : "위치"}: {surfaces || "—"}
                        </span>
                        <span>
                          {lang === "en" ? "Frequency" : "빈도"}:{" "}
                          {popupFrequencyOperatorLabel(item.frequencyMode, lang)}
                        </span>
                        <span>
                          {formatPromotionAdminSchedule(item.startAt, lang)} –{" "}
                          {formatPromotionAdminSchedule(item.endAt, lang)}
                        </span>
                        <span>
                          {lang === "en" ? "Destination" : "목적지"}:{" "}
                          {popupDestinationSummary({
                            ctaType: item.ctaType,
                            ctaTarget: item.ctaTarget,
                            externalUrl: item.externalUrl,
                            lang,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                      <span data-admin-popup-op-status="1">
                        {promotionOperatorStatusLabel(op, lang)}
                      </span>
                    </AdminToneBadge>
                    <span
                      className="rounded border border-sam-border px-1.5 py-0.5 text-[12px] text-sam-muted"
                      data-admin-popup-approval-status="1"
                    >
                      {lang === "en" ? "Approval" : "승인"}:{" "}
                      {popupApprovalStatusLabel(item.approvalStatus, lang)}
                    </span>
                    <AdminActionLink href={popupEditHref(item.id)} variant="ghost" size="sm">
                      {safeT("admin_promotion_action_preview", {
                        fallbackKo: "미리보기",
                        fallbackEn: "Preview",
                      })}
                    </AdminActionLink>
                    <AdminActionLink href={popupEditHref(item.id)} variant="ghost" size="sm">
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </AdminActionLink>
                  </div>
                </li>
              );
            })}
          </ul>
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
