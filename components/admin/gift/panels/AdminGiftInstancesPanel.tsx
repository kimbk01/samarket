"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";
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

type ListStatus = "loading" | "error" | "empty" | "ready";

const STATUS_OPTIONS = ["", "ACTIVE", "GIFT_LOCKED", "PARTIALLY_REDEEMED", "FULLY_REDEEMED", "EXPIRED", "CANCELLED"];

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function formatValidity(from: string | null | undefined, until: string | null | undefined): string {
  if (!from && !until) return "—";
  if (from && until) return `${from} → ${until}`;
  if (until) return until;
  return from ?? "—";
}

function buildTrackingQuery(args: { q?: string; status?: string }): string {
  const qs = new URLSearchParams();
  if (args.q?.trim()) qs.set("q", args.q.trim());
  if (args.status?.trim()) qs.set("status", args.status.trim());
  return qs.toString();
}

export function AdminGiftInstancesPanel({
  id: urlInstanceId,
  q: urlQ,
  status: urlStatus,
}: {
  id: string;
  q: string;
  status: string;
}) {
  const { safeT } = useI18n();
  const router = useRouter();

  const [draftQ, setDraftQ] = useState(urlQ);
  const [draftStatus, setDraftStatus] = useState(urlStatus);
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");

  useEffect(() => {
    setDraftQ(urlQ);
    setDraftStatus(urlStatus);
  }, [urlQ, urlStatus]);

  const fetchList = useCallback(async () => {
    setListStatus("loading");
    const query = buildTrackingQuery({ q: urlQ, status: urlStatus });

    try {
      const res = await fetch(`${TRACKING_API}?${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; instances?: InstanceRow[] };
      if (!res.ok || !json.ok) {
        setRows([]);
        setListStatus("error");
        return;
      }
      const list = json.instances ?? [];
      setRows(list);
      setListStatus(list.length === 0 ? "empty" : "ready");
    } catch {
      setRows([]);
      setListStatus("error");
    }
  }, [urlQ, urlStatus]);

  useEffect(() => {
    if (urlInstanceId.trim()) return;
    void fetchList();
  }, [fetchList, urlInstanceId]);

  const applySearch = () => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: { q: draftQ.trim() || null, status: draftStatus.trim() || null },
      })
    );
  };

  const openInstanceDetail = (row: InstanceRow) => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: {
          id: row.id,
          q: urlQ || null,
          status: urlStatus || null,
        },
      })
    );
  };

  if (urlInstanceId.trim()) {
    return (
      <AdminGiftInstanceDetailConsole instanceId={urlInstanceId.trim()} listQ={urlQ} listStatus={urlStatus} />
    );
  }

  return (
    <div className="space-y-4" data-admin-gift-instances="1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm">
          <span className="text-sam-muted">
            {safeT("gift_ops_instance_search", {
              fallbackKo: "Public Gift Number / Store / 구매자",
              fallbackEn: "Public Gift Number / Store / buyer",
            })}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            data-admin-gift-instance-q="1"
          />
        </label>
        <label className="text-sm">
          <span className="text-sam-muted">Status</span>
          <select
            className="mt-1 block w-full rounded-ui-rect border border-sam-border px-3 py-2 sm:w-48"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "ALL"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={adminGiftPrimaryBtnClass("min-h-[44px]")}
          style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
          onClick={applySearch}
        >
          {safeT("gift_ops_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      {listStatus === "loading" && rows.length === 0 ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : null}

      {listStatus === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_instances_error", {
              fallbackKo: "상품권 현황을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load gift instances.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void fetchList()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      {listStatus === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_instances_empty", {
            fallbackKo: "조건에 맞는 상품권이 없습니다.",
            fallbackEn: "No gift instances match this filter.",
          })}
        </p>
      ) : null}

      {listStatus === "ready" || rows.length > 0 ? (
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
                          <span className="flex h-full items-center justify-center text-[10px] text-sam-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">{row.productTitle || "—"}</td>
                    <td className="px-2 py-2">{row.giftScope === "PLATFORM" ? "DIBAY" : row.storeName || "—"}</td>
                    <td className="px-2 py-2">{row.originalBuyerLabel || "—"}</td>
                    <td className="px-2 py-2">{row.currentOwnerLabel || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.faceValue)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.remainingBalance)}</td>
                    <td className="px-2 py-2 text-xs text-sam-muted">{dt(row.purchasedAt || row.createdAt)}</td>
                    <td className="px-2 py-2 text-xs">{formatValidity(row.validFrom, row.validUntil)}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={adminGiftPrimaryBtnClass("min-h-[36px] px-3 text-xs")}
                        style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                        data-admin-gift-instance-detail-open="1"
                        onClick={() => openInstanceDetail(row)}
                      >
                        {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                      </button>
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
                      {row.giftScope === "PLATFORM" ? "DIBAY" : row.storeName} · {row.status}
                    </p>
                    <p className="text-xs tabular-nums">
                      {formatMoneyPhp(row.remainingBalance)} / {formatMoneyPhp(row.faceValue)}
                    </p>
                    <p className="text-xs text-sam-muted">{formatValidity(row.validFrom, row.validUntil)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={adminGiftPrimaryBtnClass("mt-3 w-full min-h-[40px] text-sm")}
                  style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                  data-admin-gift-instance-detail-open="1"
                  onClick={() => openInstanceDetail(row)}
                >
                  {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
