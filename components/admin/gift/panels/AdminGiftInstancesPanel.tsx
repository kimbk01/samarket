"use client";

import {
  r5DeliveryStatusLabel,
  GIFT_INSTANCE_STATUS_NAMESPACE,
} from "@/lib/admin/status-labels/r5-delivery-status-labels";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { AdminGiftInstanceDetailConsole } from "@/components/admin/gift/panels/AdminGiftInstanceDetailConsole";

const TRACKING_API = "/api/admin/gift-certificates/tracking";

type InstanceRow = {
  id: string;
  publicGiftNumber: string;
  giftScope?: "STORE" | "PLATFORM";
  storeId: string | null;
  storeName: string;
  productId: string;
  productTitle: string;
  productImageUrl?: string | null;
  originalBuyerUserId: string;
  originalBuyerLabel: string;
  currentOwnerUserId: string;
  currentOwnerLabel: string;
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number;
  status: string;
  purchasedAt: string;
  createdAt: string;
  validFrom?: string | null;
  validUntil?: string | null;
};

const STATUS_OPTIONS = ["ACTIVE", "GIFT_LOCKED", "PARTIALLY_REDEEMED", "FULLY_REDEEMED", "EXPIRED", "CANCELLED"];
/**
 * 목록 조건 = 주소 (R7) — 기존 키 `q`·`status`·`balance`(=gt0, 대시보드 딥링크) 유지 + `page`·`size`.
 * `tab=instances`·`id` 등 다른 키는 그대로 둔다.
 */
const LIST_CONFIG = { statuses: STATUS_OPTIONS, extras: ["balance"] as const };

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return formatAdminManilaDateTime(v);
  } catch {
    return v;
  }
}

import { formatGiftAdminValidityLabel } from "@/lib/gift-certificate/format-gift-admin-validity";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

function formatValidity(from: string | null | undefined, until: string | null | undefined): string {
  return formatGiftAdminValidityLabel({
    validFrom: from,
    validUntil: until,
    noExpiryLabel: "—",
  });
}


export function AdminGiftInstancesPanel({
  id: urlInstanceId,
  q: urlQ,
  status: urlStatus,
  balance: urlBalance = "",
  focus: urlFocus = "",
}: {
  id: string;
  q: string;
  status: string;
  balance?: string;
  focus?: string;
}) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const lq = useAdminListQuery(LIST_CONFIG);

  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);

  const apiQs = lq.apiQueryString;
  const fetchList = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(`${TRACKING_API}?${apiQs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; instances?: InstanceRow[]; total?: number } | null;
      if (!res.ok || !json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadErr({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        return;
      }
      const list = json.instances ?? [];
      setRows(list);
      setTotal(Number(json.total) || 0);
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [apiQs]);

  useEffect(() => {
    if (urlInstanceId.trim()) return;
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [lq.refreshKey, urlInstanceId]);

  const openInstanceDetail = (row: InstanceRow) => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: {
          id: row.id,
          q: urlQ || null,
          status: urlStatus || null,
          balance: urlBalance || null,
        },
      })
    );
  };

  if (urlInstanceId.trim()) {
    return (
      <AdminGiftInstanceDetailConsole
        instanceId={urlInstanceId.trim()}
        listQ={urlQ}
        listStatus={urlStatus}
        focus={urlFocus}
      />
    );
  }

  return (
    <div className="space-y-4" data-admin-gift-instances="1">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={safeT("gift_ops_instance_search", {
          fallbackKo: "Public Gift Number / Store / 구매자",
          fallbackEn: "Public Gift Number / Store / buyer",
        })}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: STATUS_OPTIONS.map((st) => ({ value: st, label: r5DeliveryStatusLabel(GIFT_INSTANCE_STATUS_NAMESPACE, st, ko) })),
        }}
      >
        <label className="flex h-10 items-center gap-1.5 sam-text-helper text-sam-fg">
          <input
            type="checkbox"
            checked={lq.query.extras.balance === "gt0"}
            onChange={(e) => lq.setExtra("balance", e.target.checked ? "gt0" : "")}
          />
          {ko ? "잔액 있는 것만" : "With balance only"}
        </label>
      </AdminFilterBar>

      {loadErr ? <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={lq.refresh} /> : null}

      {loading && rows.length === 0 ? <AdminLoadingState ko={ko} /> : null}

      {!loading && !loadErr && rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            lq.isFiltered
              ? undefined
              : safeT("gift_ops_instances_empty", {
                  fallbackKo: "조건에 맞는 상품권이 없습니다.",
                  fallbackEn: "No gift instances match this filter.",
                })
          }
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Gift #</th>
                  <th className="px-2 py-2">{safeT("gift_ops_col_image", { fallbackKo: "이미지", fallbackEn: "Image" })}</th>
                  <th className="px-2 py-2">{safeT("gift_admin_field_title", { fallbackKo: "상품명", fallbackEn: "Product" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_field_buyer", { fallbackKo: "구매자", fallbackEn: "Buyer" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_field_owner", { fallbackKo: "현재 소유자", fallbackEn: "Owner" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_kpi_face", { fallbackKo: "최초 금액", fallbackEn: "Face" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_kpi_remaining", { fallbackKo: "현재 잔액", fallbackEn: "Remaining" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_field_issued_at", { fallbackKo: "발급일", fallbackEn: "Issued" })}</th>
                  <th className="px-2 py-2">{safeT("gift_ops_field_validity", { fallbackKo: "유효기간", fallbackEn: "Validity" })}</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-sam-border/60" data-gift-number={row.publicGiftNumber}>
                    <td className="px-2 py-2 font-mono text-xs">{row.publicGiftNumber || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="relative h-10 w-10 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                        {row.productImageUrl ? (
                          <SamarketThumbnail src={row.productImageUrl} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[12px] text-sam-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">{row.productTitle || "—"}</td>
                    <td className="px-2 py-2">{row.giftScope === "PLATFORM" ? "DIBAY" : row.storeName || "—"}</td>
                    <td className="px-2 py-2">{row.originalBuyerLabel || "—"}</td>
                    <td className="px-2 py-2">{row.currentOwnerLabel || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(row.faceValue)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(row.remainingBalance)}</td>
                    <td className="px-2 py-2 text-xs text-sam-muted">{dt(row.purchasedAt || row.createdAt)}</td>
                    <td className="px-2 py-2 text-xs">{formatValidity(row.validFrom, row.validUntil)}</td>
                    <td className="px-2 py-2">{r5DeliveryStatusLabel(GIFT_INSTANCE_STATUS_NAMESPACE, row.status, language !== "en")}</td>
                    <td className="px-2 py-2">
                      <AdminActionButton
                        type="button"
                        variant="ghost" size="sm"
                        data-admin-gift-instance-detail-open="1"
                        onClick={() => openInstanceDetail(row)}
                      >
                        {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                      </AdminActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <div className="flex gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                    {row.productImageUrl ? (
                      <SamarketThumbnail src={row.productImageUrl} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">{row.publicGiftNumber || "—"}</p>
                    <p className="text-sm">{row.productTitle}</p>
                    <p className="text-xs text-sam-muted">
                      {row.giftScope === "PLATFORM" ? "DIBAY" : row.storeName} ·{" "}
                      {r5DeliveryStatusLabel(GIFT_INSTANCE_STATUS_NAMESPACE, row.status, language !== "en")}
                    </p>
                    <p className="text-xs tabular-nums">
                      {formatAdminPhp(row.remainingBalance)} / {formatAdminPhp(row.faceValue)}
                    </p>
                    <p className="text-xs text-sam-muted">{formatValidity(row.validFrom, row.validUntil)}</p>
                  </div>
                </div>
                <AdminActionButton
                  type="button"
                  variant="ghost" size="sm" className="mt-3 w-full"
                  data-admin-gift-instance-detail-open="1"
                  onClick={() => openInstanceDetail(row)}
                >
                  {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                </AdminActionButton>
              </li>
            ))}
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
      ) : null}
    </div>
  );
}
