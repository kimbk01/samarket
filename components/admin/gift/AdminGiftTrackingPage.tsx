"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import { formatMoneyPhp } from "@/lib/utils/format";

type InstanceRow = {
  id: string;
  publicGiftNumber: string;
  storeName: string;
  productTitle: string;
  originalBuyerLabel: string;
  currentOwnerLabel: string;
  remainingBalance: number;
  faceValue: number;
  purchasePrice: number;
  status: string;
  createdAt: string;
};

type TrackingDetail = {
  instance: InstanceRow;
  ownership: Array<{
    id: string;
    seq: number;
    eventType: string;
    fromLabel: string;
    toLabel: string;
    actorUserId: string;
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
    usedAmount: number;
    platformFee: number;
    merchantNet: number;
    feeRate: number;
    reversed: boolean;
    createdAt: string;
    reversedAt: string | null;
    revenue: Array<{ id: string; entryType: string; amount: number; createdAt: string }>;
  }>;
};

const STATUS_OPTIONS = ["", "ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED", "FULLY_REDEEMED", "SUSPENDED"];

function dt(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function AdminGiftTrackingPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [loaded, setLoaded] = useState(false);
  const selectedId = sp.get("id") ?? "";

  const load = useCallback(async () => {
    setLoaded(false);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (status.trim()) qs.set("status", status.trim());
    if (selectedId.trim()) qs.set("id", selectedId.trim());
    const res = await fetch(`/api/admin/gift-certificates/tracking?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      instances?: InstanceRow[];
      detail?: TrackingDetail | null;
    };
    setRows(json.ok ? json.instances ?? [] : []);
    setDetail(json.ok ? json.detail ?? null : null);
    setLoaded(true);
  }, [q, selectedId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? detail?.instance ?? null,
    [detail, rows, selectedId]
  );

  const runSearch = () => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (status.trim()) qs.set("status", status.trim());
    router.push(`/admin/gift-certificates/tracking?${qs.toString()}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4" data-admin-gift-tracking="1">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_tracking_title", {
            fallbackKo: "상품권 추적",
            fallbackEn: "Gift tracking",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {safeT("gift_u6_tracking_desc", {
            fallbackKo: "상품권 번호로 한 장의 구매, 소유, 선물, 사용 내역을 조회합니다.",
            fallbackEn: "Trace purchase, ownership, transfers, and redemptions for one gift.",
          })}
        </p>
      </div>

      <div className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:grid-cols-[1fr_180px_auto]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={Sam.input.base}
          placeholder={safeT("gift_u6_tracking_search_placeholder", {
            fallbackKo: "상품권 번호, Store/Product/User UUID",
            fallbackEn: "Gift number, Store/Product/User UUID",
          })}
          data-admin-gift-tracking-search="1"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={Sam.input.select}
          data-admin-gift-tracking-status="1"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt || "all"} value={opt}>
              {opt || "ALL"}
            </option>
          ))}
        </select>
        <button type="button" className={Sam.btn.primary} onClick={runSearch}>
          {safeT("gift_u6_tracking_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.1fr)]">
        <section className="space-y-2" data-admin-gift-tracking-list="1">
          {!loaded ? (
            <p className="text-sm text-sam-muted">...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_u6_tracking_empty", {
                fallbackKo: "조회된 상품권이 없습니다.",
                fallbackEn: "No gift instances found.",
              })}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                  data-admin-gift-tracking-row={row.publicGiftNumber}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => router.push(`/admin/gift-certificates/tracking?id=${encodeURIComponent(row.id)}`)}
                  >
                    <p className="font-mono text-sm font-semibold">{row.publicGiftNumber}</p>
                    <p className="mt-1 truncate text-sm text-sam-fg">{row.storeName} · {row.productTitle}</p>
                    <p className="mt-1 text-xs text-sam-muted">
                      {row.currentOwnerLabel || row.id} · {formatMoneyPhp(row.remainingBalance)} /{" "}
                      {formatMoneyPhp(row.faceValue)} · {row.status}
                    </p>
                    <p className="mt-1 text-xs text-sam-muted">{dt(row.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-gift-tracking-detail="1">
          {!selected ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_u6_tracking_select_hint", {
                fallbackKo: "상품권을 선택하면 상세 추적 내역이 표시됩니다.",
                fallbackEn: "Select a gift to view its audit trail.",
              })}
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-mono text-sm font-semibold" data-admin-gift-public-number={selected.publicGiftNumber}>
                  {selected.publicGiftNumber}
                </p>
                <p className="mt-1 break-all text-xs text-sam-muted">Internal ID: {selected.id}</p>
                <p className="mt-2 text-sm">{selected.storeName} · {selected.productTitle}</p>
                <p className="text-xs text-sam-muted">
                  Face {formatMoneyPhp(selected.faceValue)} · Paid {formatMoneyPhp(selected.purchasePrice)} · Remaining{" "}
                  {formatMoneyPhp(selected.remainingBalance)} · {selected.status}
                </p>
                <p className="text-xs text-sam-muted">
                  Buyer: {selected.originalBuyerLabel || "-"} · Owner: {selected.currentOwnerLabel || "-"}
                </p>
              </div>

              {detail ? (
                <>
                  <div>
                    <h2 className="text-sm font-semibold">Ownership</h2>
                    <ul className="mt-2 space-y-1 text-xs">
                      {detail.ownership.map((row) => (
                        <li key={row.id}>
                          #{row.seq} {row.eventType}: {row.fromLabel || "-"} → {row.toLabel || "-"} · {dt(row.createdAt)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Transfers</h2>
                    <ul className="mt-2 space-y-2 text-xs">
                      {detail.transfers.map((row) => (
                        <li key={row.id} className="rounded-ui-rect bg-sam-app p-2">
                          <p>{row.senderLabel || row.id} → {row.recipientLabel || "-"} · {row.status}</p>
                          <p className="text-sam-muted">offered {dt(row.offeredAt)} · resolved {dt(row.resolvedAt)}</p>
                          <p className="break-all text-sam-muted">room {row.roomId || "-"} · message {row.messageId || "-"}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Redemptions / Revenue</h2>
                    <ul className="mt-2 space-y-2 text-xs">
                      {detail.redemptions.map((row) => (
                        <li key={row.id} className="rounded-ui-rect bg-sam-app p-2">
                          <p>
                            Order {row.orderNo || row.orderId} · {row.orderStatus || "-"} ·{" "}
                            {row.reversed ? "reversed" : "active"}
                          </p>
                          <p>
                            Used {formatMoneyPhp(row.usedAmount)} · Fee {formatMoneyPhp(row.platformFee)} · Merchant{" "}
                            {formatMoneyPhp(row.merchantNet)} · {row.feeRate}%
                          </p>
                          <p className="text-sam-muted">redeemed {dt(row.createdAt)} · reversed {dt(row.reversedAt)}</p>
                          {row.revenue.length > 0 ? (
                            <ul className="mt-1 space-y-1 text-sam-muted">
                              {row.revenue.map((entry) => (
                                <li key={entry.id}>
                                  {entry.entryType}: {formatMoneyPhp(entry.amount)} · {dt(entry.createdAt)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
