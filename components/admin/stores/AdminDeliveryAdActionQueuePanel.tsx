"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  normalizeAdminListPage,
  normalizeAdminListPageSize,
  type AdminListPageSize,
} from "@/lib/admin/list-query/admin-list-query";
import type { DeliveryAdAdminActionQueueItem } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import {
  adminDeliveryAdOpsCaseStatusLabelKey,
} from "@/lib/stores/advertising/delivery-ad-admin-required-decision";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { isDeliveryBannerCreativeAssetReady } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import type { MessageKey } from "@/lib/i18n/messages";
import { DELIVERY_AD_ADMIN_ACTION_QUEUE_COLUMNS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import {
  adminDisplayApplicantLabel,
} from "@/lib/admin/operator-ux/operator-labels";
import {
  adsLifecycleOperatorLabel,
  adsPaymentLabel,
  adsRemainingPeriodLabel,
} from "@/lib/admin/domain-control/ads-operator-cta";

export function AdminDeliveryAdActionQueuePanel() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const [items, setItems] = useState<DeliveryAdAdminActionQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /**
   * R7 서버 페이지 — 결제 확인 Case 전체(total)를 페이지로 본다.
   * 페이지·크기는 주소 `qpage`·`qsize` (같은 화면 하단 목록의 `page`·`size` 와 분리) — 새로고침·뒤로가기 유지.
   */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = normalizeAdminListPage(searchParams.get("qpage"));
  const size = normalizeAdminListPageSize(searchParams.get("qsize"), 50);
  const setQueuePage = useCallback(
    (nextPage: number, nextSize: AdminListPageSize = size) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage > 1) params.set("qpage", String(nextPage));
      else params.delete("qpage");
      if (nextSize !== 50) params.set("qsize", String(nextSize));
      else params.delete("qsize");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, size]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ limit: String(size), offset: String((page - 1) * size) });
      const res = await fetch(`/api/admin/delivery-ads/action-queue?${qs.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        items?: DeliveryAdAdminActionQueueItem[];
        total?: number;
      };
      if (!res.ok || !json.ok) {
        setError(true);
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setTotal(typeof json.total === "number" ? json.total : 0);
    } catch {
      setError(true);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, size]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-admin-delivery-ads-action-queue="design-board">
      <AdminCard titleKey="admin_delivery_ads_action_queue_title">
        <p className="mb-2 text-[12px] text-sam-muted">
          {safeT("admin_delivery_ads_action_queue_subtitle", {
            fallbackKo: "관리자 조치가 필요한 운영 Case입니다. 읽지 않은 메시지와는 별개입니다.",
            fallbackEn: "Ops cases that need an admin decision. Separate from unread messages.",
          })}
          {total > 0 ? (
            <span className="ml-2 font-semibold text-sam-fg">
              {t("admin_delivery_ads_action_queue_count", { count: total })}
            </span>
          ) : null}
        </p>

        {loading ? (
          <AdminLoadingState ko={ko} label={t("admin_delivery_ads_loading")} />
        ) : error ? (
          <AdminErrorState ko={ko} code="load_failed" onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <AdminEmptyState
            ko={ko}
            message={safeT("admin_delivery_ads_action_queue_empty", {
              fallbackKo: "지금 처리할 운영 Case가 없습니다.",
              fallbackEn: "No ops cases need action right now.",
            })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[640px] border-collapse text-[12px]"
              data-admin-delivery-ads-action-queue-table="design-board"
            >
              <thead>
                <tr className="bg-sam-surface-muted text-left text-sam-muted">
                  {DELIVERY_AD_ADMIN_ACTION_QUEUE_COLUMNS.map((col) => (
                    <th key={col.id} className="border border-sam-border p-2 font-semibold">
                      {t(col.labelKey)}
                    </th>
                  ))}
                  <th className="border border-sam-border p-2 font-semibold">
                    {t("admin_delivery_ads_queue_col_action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const presentation = mapAdminDeliveryAdActionQueuePresentation({
                    productKind: item.productKind,
                    lifecycleStatus: item.campaignLifecycle,
                    creativeAssetPath: item.creativeAssetPath,
                    hadChangesRequested: item.hadChangesRequested,
                  });
                  const productLabel =
                    item.productKind === "banner"
                      ? t("admin_delivery_ads_product_banner")
                      : t("admin_delivery_ads_product_store_sponsored");
                  const focus =
                    presentation.cta === "produce_banner" ? "creative" : "operations";
                  const href =
                    presentation.cta === "produce_banner"
                      ? DELIVERY_AD_ADMIN_ROUTES.creative(item.campaignId)
                      : `${item.destination}?product=${encodeURIComponent(item.productKind)}&focus=${focus}`;
                  const creativeReady = isDeliveryBannerCreativeAssetReady(
                    item.creativeAssetPath
                  );
                  const commercialSummary = `${productLabel} · ${t(presentation.bucketLabelKey as MessageKey)}`;
                  return (
                    <tr
                      key={item.caseId}
                      className="bg-sam-surface"
                      data-admin-delivery-ads-queue-row="1"
                      data-case-id={item.caseId}
                    >
                      <td className="border border-sam-border p-2 font-medium text-sam-fg">
                        {item.storeName ||
                          adminDisplayApplicantLabel(
                            item.campaignTitle || "",
                            language !== "en"
                          )}
                      </td>
                      <td className="border border-sam-border p-2 text-sam-fg">{productLabel}</td>
                      <td className="border border-sam-border p-2 text-sam-muted">
                        {adsLifecycleOperatorLabel(
                          item.campaignLifecycle,
                          language !== "en"
                        )}
                      </td>
                      <td
                        className="border border-sam-border p-2"
                        data-queue-commercial-summary="1"
                      >
                        <span className="font-medium text-sam-primary">
                          {safeT(presentation.bucketLabelKey, {
                            fallbackKo: "처리 필요",
                            fallbackEn: "Needs action",
                          })}
                        </span>
                        <span className="ml-1 text-[12px] text-sam-muted">
                          ·{" "}
                          {adsPaymentLabel(
                            item.fundingStatus,
                            "CASH",
                            language !== "en"
                          )}
                        </span>
                        {item.startAt || item.endAt ? (
                          <span className="ml-1 text-[12px] text-sam-muted">
                            ·{" "}
                            {adsRemainingPeriodLabel(
                              item.startAt,
                              item.endAt,
                              language !== "en"
                            )}
                          </span>
                        ) : null}
                        {item.productKind === "banner" ? (
                          <span className="ml-1 text-[12px] text-sam-muted">
                            ·{" "}
                            {creativeReady
                              ? safeT("admin_delivery_ads_creative_status_ready", {
                                  fallbackKo: "제작 완료",
                                  fallbackEn: "Ready",
                                })
                              : safeT("admin_delivery_ads_creative_status_needs_production", {
                                  fallbackKo: "제작 필요",
                                  fallbackEn: "Needs production",
                                })}
                          </span>
                        ) : null}
                        <span className="sr-only">{commercialSummary}</span>
                        {item.caseStatus ? (
                          <span className="sr-only">
                            {safeT(
                              adminDeliveryAdOpsCaseStatusLabelKey(item.caseStatus) as MessageKey,
                              {
                                fallbackKo: item.caseStatus,
                                fallbackEn: item.caseStatus,
                              }
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className="border border-sam-border p-2 tabular-nums text-sam-muted">
                        {item.updatedAt ? formatAdminManilaDate(item.updatedAt) : "—"}
                      </td>
                      <td className="border border-sam-border p-2">
                        <AdminActionLink
                          href={href}
                          variant="ghost"
                          size="sm"
                          data-admin-delivery-ads-queue-open="1"
                          data-admin-delivery-ads-queue-cta={presentation.cta}
                        >
                          {safeT(presentation.ctaLabelKey, {
                            fallbackKo: "검토하기",
                            fallbackEn: "Review",
                          })}
                        </AdminActionLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!error && (total > 0 || page > 1) ? (
          <AdminPagination
            ko={ko}
            page={page}
            size={size}
            total={total}
            disabled={loading}
            onPageChange={(next) => setQueuePage(next)}
            onSizeChange={(next) => setQueuePage(1, next)}
          />
        ) : null}
      </AdminCard>
    </div>
  );
}
