"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const [items, setItems] = useState<DeliveryAdAdminActionQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/delivery-ads/action-queue?limit=50", {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-admin-delivery-ads-action-queue="design-board">
      <AdminCard titleKey="admin_delivery_ads_action_queue_title">
        <p className="mb-2 text-[12px] text-[#757575]">
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
          <p className="text-[13px] text-sam-muted" role="status">
            {t("admin_delivery_ads_loading")}
          </p>
        ) : error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {safeT("admin_delivery_ads_action_queue_error", {
              fallbackKo: "처리 필요 목록을 불러오지 못했습니다.",
              fallbackEn: "Could not load the action queue.",
            })}
          </p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-sam-muted" role="status">
            {safeT("admin_delivery_ads_action_queue_empty", {
              fallbackKo: "지금 처리할 운영 Case가 없습니다.",
              fallbackEn: "No ops cases need action right now.",
            })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[640px] border-collapse text-[12px]"
              data-admin-delivery-ads-action-queue-table="design-board"
            >
              <thead>
                <tr className="bg-[#F5F5F5] text-left text-[#757575]">
                  {DELIVERY_AD_ADMIN_ACTION_QUEUE_COLUMNS.map((col) => (
                    <th key={col.id} className="border border-[#BDBDBD] p-2 font-semibold">
                      {t(col.labelKey)}
                    </th>
                  ))}
                  <th className="border border-[#BDBDBD] p-2 font-semibold">
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
                      className="bg-white"
                      data-admin-delivery-ads-queue-row="1"
                      data-case-id={item.caseId}
                    >
                      <td className="border border-[#BDBDBD] p-2 font-medium text-sam-fg">
                        {item.storeName ||
                          adminDisplayApplicantLabel(
                            item.campaignTitle || "",
                            language !== "en"
                          )}
                      </td>
                      <td className="border border-[#BDBDBD] p-2 text-sam-fg">{productLabel}</td>
                      <td className="border border-[#BDBDBD] p-2 text-[#757575]">
                        {adsLifecycleOperatorLabel(
                          item.campaignLifecycle,
                          language !== "en"
                        )}
                      </td>
                      <td
                        className="border border-[#BDBDBD] p-2"
                        data-queue-commercial-summary="1"
                      >
                        <span className="font-medium text-[#0A823E]">
                          {safeT(presentation.bucketLabelKey, {
                            fallbackKo: "처리 필요",
                            fallbackEn: "Needs action",
                          })}
                        </span>
                        <span className="ml-1 text-[11px] text-[#757575]">
                          ·{" "}
                          {adsPaymentLabel(
                            item.fundingStatus,
                            "CASH",
                            language !== "en"
                          )}
                        </span>
                        {item.startAt || item.endAt ? (
                          <span className="ml-1 text-[11px] text-[#757575]">
                            ·{" "}
                            {adsRemainingPeriodLabel(
                              item.startAt,
                              item.endAt,
                              language !== "en"
                            )}
                          </span>
                        ) : null}
                        {item.productKind === "banner" ? (
                          <span className="ml-1 text-[11px] text-[#757575]">
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
                      <td className="border border-[#BDBDBD] p-2 tabular-nums text-[#757575]">
                        {item.updatedAt
                          ? item.updatedAt.slice(0, 10)
                          : "—"}
                      </td>
                      <td className="border border-[#BDBDBD] p-2">
                        <Link
                          href={href}
                          className="inline-flex rounded-ui-rect border border-[#BDBDBD] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0A823E]"
                          data-admin-delivery-ads-queue-open="1"
                          data-admin-delivery-ads-queue-cta={presentation.cta}
                        >
                          {safeT(presentation.ctaLabelKey, {
                            fallbackKo: "검토하기",
                            fallbackEn: "Review",
                          })}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
