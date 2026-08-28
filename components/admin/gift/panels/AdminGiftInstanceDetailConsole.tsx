"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

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

type TrackingDetail = {
  instance: InstanceRow;
  ownership: Array<{
    id: string;
    seq: number;
    eventType: string;
    fromLabel: string;
    toLabel: string;
    createdAt: string;
  }>;
  transfers: Array<{
    id: string;
    senderLabel: string;
    recipientLabel: string;
    status: string;
    offeredAt: string;
    resolvedAt: string | null;
    roomId: string | null;
    messageId: string | null;
  }>;
  redemptions: Array<{
    id: string;
    orderId: string;
    orderNo: string | null;
    orderStatus: string | null;
    redeemedStoreId?: string | null;
    redeemedStoreName?: string;
    usedAmount: number;
    platformFee: number;
    merchantNet: number;
    feeRate: number;
    reversed: boolean;
    createdAt: string;
    reversedAt: string | null;
    revenue: Array<{ id: string; entryType: string; amount: number; createdAt: string }>;
  }>;
  settlement?: {
    availableRevenue: number;
    cashOuts: Array<{
      id: string;
      amount: number;
      status: string;
      createdAt: string;
      paidAt: string | null;
    }>;
    conversions: Array<{
      id: string;
      amount: number;
      status: string;
      createdAt: string;
      approvedAt: string | null;
    }>;
  };
  recovery?: Array<{
    id: string;
    linkage: string;
    amountOriginal: number;
    amountRemaining: number;
    status: string;
  }>;
  promo?: {
    obligationAmount: number;
    ledgerEntries: Array<{ id: string; entryType: string; amount: number; createdAt: string }>;
  };
};

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

function recognitionLabel(entries: { entryType: string }[], reversed: boolean): string {
  if (reversed) return "REVERSED";
  if (entries.some((e) => e.entryType === "REVENUE_AVAILABLE")) return "RECOGNIZED";
  return "PENDING";
}

function buildTrackingQuery(args: { q?: string; status?: string; id: string }): string {
  const qs = new URLSearchParams();
  if (args.q?.trim()) qs.set("q", args.q.trim());
  if (args.status?.trim()) qs.set("status", args.status.trim());
  qs.set("id", args.id.trim());
  return qs.toString();
}

export function AdminGiftInstanceDetailConsole({
  instanceId,
  listQ = "",
  listStatus = "",
}: {
  instanceId: string;
  listQ?: string;
  listStatus?: string;
}) {
  const { safeT } = useI18n();
  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const backHref = buildAdminGiftOpsHref({
    tab: "instances",
    extra: { q: listQ.trim() || null, status: listStatus.trim() || null },
  });

  const load = useCallback(async () => {
    const trimmed = instanceId.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;

    setState("loading");
    const query = buildTrackingQuery({ q: listQ, status: listStatus, id: trimmed });

    try {
      const res = await fetch(`${TRACKING_API}?${query}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (seq !== seqRef.current) return;

      const json = (await res.json()) as {
        ok?: boolean;
        detail?: TrackingDetail | null;
      };
      if (!res.ok || !json.ok || !json.detail) {
        setDetail(null);
        setState("error");
        return;
      }

      setDetail(json.detail);
      setState("ready");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current) return;
      setDetail(null);
      setState("error");
    }
  }, [instanceId, listQ, listStatus]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const row = detail?.instance;
  const redeemedGross = (detail?.redemptions ?? [])
    .filter((r) => !r.reversed)
    .reduce((sum, r) => sum + Math.max(0, r.usedAmount), 0);

  if (state === "loading" && !detail) {
    return (
      <p className="text-sm text-sam-muted" data-admin-gift-instance-detail-loading="1">
        {safeT("gift_ops_instance_detail_loading", {
          fallbackKo: "상품권 상세를 불러오는 중…",
          fallbackEn: "Loading gift instance detail…",
        })}
      </p>
    );
  }

  if (state === "error" || !row || !detail) {
    return (
      <div className="space-y-3" data-admin-gift-instance-detail-error="1">
        <Link href={backHref} className={`${Sam.btn.secondary} inline-flex min-h-[44px] items-center px-4 text-sm`}>
          ← {safeT("gift_ops_instance_back_list", { fallbackKo: "발급 상품권", fallbackEn: "Issued gifts" })}
        </Link>
        <p className="text-sm text-red-600">
          {safeT("gift_ops_instance_detail_error", {
            fallbackKo: "상품권 상세를 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load gift instance detail.",
          })}
        </p>
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
          {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4" data-admin-gift-instance-detail="1" data-admin-gift-instance-id={row.id}>
      <Link
        href={backHref}
        className={`${Sam.btn.secondary} inline-flex min-h-[44px] items-center px-4 text-sm`}
        data-admin-gift-instance-back="1"
      >
        ← {safeT("gift_ops_instance_back_list", { fallbackKo: "발급 상품권", fallbackEn: "Issued gifts" })}
      </Link>

      <div className="flex flex-col gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:flex-row">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
          {row.productImageUrl ? (
            <SamarketThumbnail
              src={row.productImageUrl}
              alt=""
              fill
              className="relative h-full w-full"
              imageClassName="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-sam-muted">—</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-lg font-semibold">{row.publicGiftNumber || "—"}</p>
          <p className="text-sm font-semibold">{row.productTitle || "—"}</p>
          <p className="text-sm text-sam-muted">
            {row.giftScope === "PLATFORM"
              ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
              : row.storeName || "—"}{" "}
            · {row.status}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-gift-instance-kpis="1">
        {[
          {
            label: safeT("gift_ops_kpi_face", { fallbackKo: "최초 금액", fallbackEn: "Face value" }),
            value: formatMoneyPhp(row.faceValue),
          },
          {
            label: safeT("gift_ops_kpi_remaining", { fallbackKo: "현재 잔액", fallbackEn: "Remaining" }),
            value: formatMoneyPhp(row.remainingBalance),
          },
          {
            label: safeT("gift_ops_kpi_redeemed_gross", { fallbackKo: "누적 사용", fallbackEn: "Redeemed" }),
            value: formatMoneyPhp(redeemedGross),
          },
          {
            label: safeT("gift_ops_field_validity", { fallbackKo: "유효기간", fallbackEn: "Validity" }),
            value: formatValidity(row.validFrom, row.validUntil),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-xs text-sam-muted">{kpi.label}</p>
            <p className="text-sm font-semibold tabular-nums break-words">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_instance_info", { fallbackKo: "상품권 정보", fallbackEn: "Certificate info" })}
        </h3>
        <p className="tabular-nums">
          {safeT("gift_ops_field_purchase", { fallbackKo: "구매 금액", fallbackEn: "Purchase price" })}:{" "}
          {formatMoneyPhp(row.purchasePrice)}
        </p>
        <p>
          {safeT("gift_ops_field_issued_at", { fallbackKo: "발급일", fallbackEn: "Issued" })}:{" "}
          {dt(row.purchasedAt || row.createdAt)}
        </p>
        <p className="text-xs text-sam-muted break-all font-mono">ID: {row.id}</p>
        {row.productId ? (
          <Link
            href={buildAdminGiftOpsHref({ tab: "products", extra: { id: row.productId } })}
            className="inline-block text-xs font-semibold text-sam-brand"
          >
            {safeT("gift_ops_cta_product_detail", { fallbackKo: "상품 상세", fallbackEn: "Product detail" })}
          </Link>
        ) : null}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_buyer_owner", { fallbackKo: "구매자 / 현재 소유자", fallbackEn: "Buyer / owner" })}
        </h3>
        <p>
          {safeT("gift_ops_field_buyer", { fallbackKo: "구매자", fallbackEn: "Buyer" })}: {row.originalBuyerLabel || "—"}
        </p>
        <p>
          {safeT("gift_ops_field_owner", { fallbackKo: "현재 소유자", fallbackEn: "Current owner" })}:{" "}
          {row.currentOwnerLabel || "—"}
        </p>
        {detail.ownership.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-sam-muted">
            {detail.ownership.map((e) => (
              <li key={e.id}>
                #{e.seq} {e.eventType}: {e.fromLabel || "—"} → {e.toLabel || "—"} · {dt(e.createdAt)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_transfer", { fallbackKo: "선물 이력", fallbackEn: "Transfer history" })}
        </h3>
        {detail.transfers.length === 0 ? (
          <p className="text-sam-muted">
            {safeT("gift_ops_transfers_empty", { fallbackKo: "선물 이력이 없습니다.", fallbackEn: "No transfers." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.transfers.map((t) => (
              <li key={t.id} className="rounded-ui-rect bg-sam-app p-2">
                {t.senderLabel} → {t.recipientLabel} · {t.status} · {dt(t.offeredAt)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_redeem", { fallbackKo: "사용 내역", fallbackEn: "Redemptions" })}
        </h3>
        {detail.redemptions.length === 0 ? (
          <p className="text-sam-muted">
            {safeT("gift_ops_redemptions_empty", { fallbackKo: "사용 내역이 없습니다.", fallbackEn: "No redemptions." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.redemptions.map((r) => (
              <li key={r.id} className="rounded-ui-rect bg-sam-app p-2">
                <p>
                  Order {r.orderNo || r.orderId} · {r.orderStatus || "—"} ·{" "}
                  {recognitionLabel(r.revenue, r.reversed)}
                </p>
                {r.redeemedStoreName || r.redeemedStoreId ? (
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_ops_redeemed_store", { fallbackKo: "사용 매장", fallbackEn: "Redeemed store" })}:{" "}
                    {r.redeemedStoreName || r.redeemedStoreId}
                  </p>
                ) : null}
                <p className="tabular-nums">
                  {formatMoneyPhp(r.usedAmount)} · Fee {r.feeRate}% {formatMoneyPhp(r.platformFee)} · Net{" "}
                  {formatMoneyPhp(r.merchantNet)}
                </p>
                <p className="text-xs text-sam-muted">{dt(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_balance", { fallbackKo: "잔액", fallbackEn: "Balance" })}
        </h3>
        <p className="tabular-nums">
          {safeT("gift_ops_kpi_remaining", { fallbackKo: "현재 잔액", fallbackEn: "Remaining" })}:{" "}
          {formatMoneyPhp(row.remainingBalance)}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_settlement", { fallbackKo: "정산", fallbackEn: "Settlement" })}
        </h3>
        {!detail.settlement && (detail.recovery ?? []).length === 0 ? (
          <p className="text-sam-muted">
            {safeT("gift_ops_settlement_empty", { fallbackKo: "정산 데이터가 없습니다.", fallbackEn: "No settlement data." })}
          </p>
        ) : (
          <>
            {detail.settlement ? (
              <p className="tabular-nums">
                {safeT("gift_ops_settlement_available", {
                  fallbackKo: "Available Gift Revenue",
                  fallbackEn: "Available Gift Revenue",
                })}
                : {formatMoneyPhp(detail.settlement.availableRevenue)}
              </p>
            ) : null}
            {(detail.settlement?.cashOuts.length ?? 0) === 0 &&
            (detail.settlement?.conversions.length ?? 0) === 0 ? (
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_settlement_moves_empty", {
                  fallbackKo: "환전·전환 내역이 없습니다.",
                  fallbackEn: "No cash-out or conversion rows.",
                })}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {(detail.settlement?.cashOuts ?? []).map((c) => (
                  <li key={c.id}>
                    {safeT("gift_ops_cash_out", { fallbackKo: "외부 환전", fallbackEn: "Cash out" })}{" "}
                    {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                  </li>
                ))}
                {(detail.settlement?.conversions ?? []).map((c) => (
                  <li key={c.id}>
                    {safeT("gift_ops_store_cash", { fallbackKo: "Store Cash 전환", fallbackEn: "Store Cash" })}{" "}
                    {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                  </li>
                ))}
              </ul>
            )}
            {(detail.recovery ?? []).length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-semibold">Recovery</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {(detail.recovery ?? []).map((r) => (
                    <li key={r.id}>
                      {r.linkage} · {formatMoneyPhp(r.amountRemaining)} / {formatMoneyPhp(r.amountOriginal)} · {r.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_recovery_none", {
                  fallbackKo: "관련 Recovery 없음",
                  fallbackEn: "No related recovery",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
