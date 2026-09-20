"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
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

export function AdminPlatformPopupListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [items, setItems] = useState<PlatformPopupAdminListItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await fetch(`/api/admin/platform-popup-campaigns${q}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: PlatformPopupAdminListItem[];
      error?: string;
    };
    if (!res.ok || !json.ok) {
      setError(
        lang === "en"
          ? "Could not load popup campaigns."
          : "팝업 캠페인을 불러오지 못했습니다."
      );
      setItems([]);
    } else {
      setItems(json.items ?? []);
    }
    setLoading(false);
  }, [status, lang]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

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

      <AdminCard>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_filter_status", {
              fallbackKo: "운영 상태",
              fallbackEn: "Status",
            })}
            <select
              className="ml-2 rounded border border-sam-border bg-sam-surface px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                {safeT("admin_platform_popup_filter_all", {
                  fallbackKo: "전체",
                  fallbackEn: "All",
                })}
              </option>
              {PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <AdminActionButton
            className="ml-auto"
            variant="primary"
            disabled={creating}
            onClick={() => void onCreate()}
          >
            {safeT("admin_platform_popup_create", {
              fallbackKo: "캠페인 만들기",
              fallbackEn: "Create campaign",
            })}
          </AdminActionButton>
        </div>
      </AdminCard>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard>
        {loading ? (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : empty ? (
          <div>
            <p className="text-sm text-sam-muted">
              {safeT("admin_platform_popup_empty", {
                fallbackKo: "등록된 프로모션 팝업이 없습니다.",
                fallbackEn: "No promotion popups yet.",
              })}
            </p>
            <AdminActionButton
              className="mt-3"
              variant="primary"
              disabled={creating}
              onClick={() => void onCreate()}
            >
              {safeT("admin_platform_popup_create", {
                fallbackKo: "캠페인 만들기",
                fallbackEn: "Create campaign",
              })}
            </AdminActionButton>
          </div>
        ) : (
          <ul className="divide-y divide-sam-border" data-admin-popup-operational-list="1">
            {items.map((item) => {
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
                  className="flex flex-wrap items-start justify-between gap-2 py-2.5"
                  data-admin-popup-composition={compositionLabel}
                >
                  <div className="flex min-w-0 flex-1 gap-2">
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
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-sam-muted">
                        <span data-admin-popup-form-label="1">{compositionLabel}</span>
                        {benefitLabel ? (
                          <span className="text-amber-700" data-admin-popup-benefit-hint="1">
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
                      className="rounded border border-sam-border px-1.5 py-0.5 text-[10px] text-sam-muted"
                      data-admin-popup-approval-status="1"
                    >
                      {lang === "en" ? "Approval" : "승인"}:{" "}
                      {popupApprovalStatusLabel(item.approvalStatus, lang)}
                    </span>
                    <AdminActionLink href={popupEditHref(item.id)} variant="secondary">
                      {safeT("admin_promotion_action_preview", {
                        fallbackKo: "미리보기",
                        fallbackEn: "Preview",
                      })}
                    </AdminActionLink>
                    <AdminActionLink href={popupEditHref(item.id)} variant="secondary">
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
        )}
      </AdminCard>
    </div>
  );
}
