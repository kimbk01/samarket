"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import type { DeliveryAdAdminActionQueueItem } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import {
  adminDeliveryAdLifecycleLabelKey,
} from "@/lib/stores/advertising/delivery-ad-admin-required-decision";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * CUT 3-E / R2 — consumes listDeliveryAdAdminActionQueue via HTTP.
 * Presentation buckets + CTAs from lifecycle + Banner creative readiness.
 */
export function AdminDeliveryAdActionQueuePanel() {
  const { t, safeT } = useI18n();
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
          <ul className="space-y-2" data-admin-delivery-ads-action-queue-list="1">
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
              const lifecycleKey = item.campaignLifecycle
                ? (adminDeliveryAdLifecycleLabelKey(item.campaignLifecycle) as MessageKey)
                : null;
              const focus =
                presentation.cta === "produce_banner" ? "creative" : "operations";
              return (
                <li
                  key={item.caseId}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
                  data-admin-delivery-ads-queue-row="1"
                  data-case-id={item.caseId}
                  data-product-kind={item.productKind}
                  data-lifecycle={item.campaignLifecycle ?? ""}
                  data-case-status={item.caseStatus}
                  data-queue-bucket={presentation.bucket}
                  data-queue-cta={presentation.cta}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sam-fg break-words">
                        {item.campaignTitle || item.campaignId}
                      </p>
                      <p className="mt-0.5 text-[12px] text-sam-fg">
                        <span className="font-medium">{productLabel}</span>
                        {" · "}
                        <span>
                          {lifecycleKey
                            ? safeT(lifecycleKey, {
                                fallbackKo: item.campaignLifecycle || "—",
                                fallbackEn: item.campaignLifecycle || "—",
                              })
                            : "—"}
                        </span>
                        {" · "}
                        <span className="font-medium text-sam-brand">
                          {safeT(presentation.bucketLabelKey, {
                            fallbackKo: "처리 필요",
                            fallbackEn: "Needs action",
                          })}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-sam-muted break-words" data-queue-commercial-summary="1">
                        {productLabel}
                        {item.campaignTitle ? ` · ${item.campaignTitle}` : ""}
                        {item.campaignLifecycle
                          ? ` · ${
                              lifecycleKey
                                ? safeT(lifecycleKey, {
                                    fallbackKo: item.campaignLifecycle,
                                    fallbackEn: item.campaignLifecycle,
                                  })
                                : item.campaignLifecycle
                            }`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sam-muted break-all">
                        {t("admin_delivery_ads_action_queue_updated")}:{" "}
                        {item.updatedAt
                          ? item.updatedAt.slice(0, 19).replace("T", " ")
                          : "—"}
                      </p>
                    </div>
                    <Link
                      href={`${item.destination}?product=${encodeURIComponent(item.productKind)}&focus=${focus}`}
                      className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
                      data-admin-delivery-ads-queue-open="1"
                      data-admin-delivery-ads-queue-cta={presentation.cta}
                    >
                      {safeT(presentation.ctaLabelKey, {
                        fallbackKo: "상세 보기",
                        fallbackEn: "Open detail",
                      })}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
  );
}
