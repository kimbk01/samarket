"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type InstanceRow = {
  id: string;
  publicGiftNumber: string;
  giftScope?: "STORE" | "PLATFORM";
  storeId: string | null;
  storeName: string;
  productId: string;
  productTitle: string;
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
    redemptionId: string | null;
    amountOriginal: number;
    amountRemaining: number;
    status: string;
    createdAt: string;
    linkage: "REDEMPTION" | "POOL_LEVEL";
  }>;
};

const STATUS_OPTIONS = ["", "ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED", "FULLY_REDEEMED", "SUSPENDED"];

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function recognitionLabel(entries: { entryType: string }[], reversed: boolean): string {
  if (reversed) return "REVERSED";
  if (entries.some((e) => e.entryType === "REVENUE_AVAILABLE")) return "RECOGNIZED";
  return "PENDING";
}

export function AdminGiftInstancesPanel({
  id,
  q: initialQ,
  status: initialStatus,
}: {
  id: string;
  q: string;
  status: string;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const loadGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const rowsRef = useRef(rows);
  const detailRef = useRef(detail);
  rowsRef.current = rows;
  detailRef.current = detail;

  useEffect(() => {
    setQ(initialQ);
    setStatus(initialStatus);
  }, [initialQ, initialStatus]);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++loadGenerationRef.current;

    const background =
      opts?.background ??
      (Boolean(id.trim()) && (rowsRef.current.length > 0 || detailRef.current != null));

    if (!background) setState("loading");
    else setRefreshing(true);

    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (status.trim()) qs.set("status", status.trim());
    if (id.trim()) qs.set("id", id.trim());

    try {
      const res = await fetch(`/api/admin/gift-certificates/tracking?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (generation !== loadGenerationRef.current) return;

      const json = (await res.json()) as {
        ok?: boolean;
        instances?: InstanceRow[];
        detail?: TrackingDetail | null;
      };
      if (!res.ok || !json.ok) {
        if (!background) {
          setRows([]);
          setDetail(null);
          setState("error");
        }
        return;
      }
      const list = json.instances ?? [];
      setRows(list);
      setDetail(json.detail ?? null);
      setState(list.length === 0 && !json.detail ? "empty" : "data");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (generation !== loadGenerationRef.current) return;
      if (!background) {
        setRows([]);
        setDetail(null);
        setState("error");
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setRefreshing(false);
      }
    }
  }, [id, q, status]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const selected = useMemo(
    () => rows.find((r) => r.id === id || r.publicGiftNumber === id.toUpperCase()) ?? detail?.instance ?? null,
    [detail, id, rows]
  );

  const pushSearch = () => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: { q: q.trim() || null, status: status.trim() || null },
      })
    );
  };

  const openDetail = (row: InstanceRow) => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: {
          id: row.id,
          q: q.trim() || null,
          status: status.trim() || null,
        },
      })
    );
  };

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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushSearch();
            }}
            data-admin-gift-instance-q="1"
          />
        </label>
        <label className="text-sm">
          <span className="text-sam-muted">Status</span>
          <select
            className="mt-1 block w-full rounded-ui-rect border border-sam-border px-3 py-2 sm:w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
          onClick={pushSearch}
        >
          {safeT("gift_ops_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      {refreshing ? (
        <p className="text-xs text-sam-muted" aria-live="polite">
          {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : null}

      {state === "loading" && rows.length === 0 && !id.trim() ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_instances_error", {
              fallbackKo: "상품권 현황을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load gift instances.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_instances_empty", {
            fallbackKo: "조건에 맞는 상품권이 없습니다.",
            fallbackEn: "No gift instances match this filter.",
          })}
        </p>
      ) : null}

      {(state === "data" || (state === "loading" && rows.length > 0)) ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Gift #</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Buyer</th>
                  <th className="px-2 py-2">Owner</th>
                  <th className="px-2 py-2">Face</th>
                  <th className="px-2 py-2">Remaining</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Issued</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-sam-border/60" data-gift-number={row.publicGiftNumber}>
                    <td className="px-2 py-2 font-mono text-xs">{row.publicGiftNumber || "—"}</td>
                    <td className="px-2 py-2">
                      {row.giftScope === "PLATFORM"
                        ? "DIBAY"
                        : row.storeName || "—"}
                    </td>
                    <td className="px-2 py-2">{row.productTitle || "—"}</td>
                    <td className="px-2 py-2">{row.originalBuyerLabel || "—"}</td>
                    <td className="px-2 py-2">{row.currentOwnerLabel || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.faceValue)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.remainingBalance)}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2 text-xs text-sam-muted">{dt(row.purchasedAt || row.createdAt)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={adminGiftPrimaryBtnClass("min-h-[36px] px-3 text-xs")}
                        style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                        data-admin-gift-instance-detail-open="1"
                        aria-pressed={id === row.id}
                        onClick={() => openDetail(row)}
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
                <p className="font-mono text-sm font-semibold">{row.publicGiftNumber || "—"}</p>
                <p className="text-sm">{row.storeName} · {row.productTitle}</p>
                <p className="text-xs text-sam-muted">
                  {row.status} · rem {formatMoneyPhp(row.remainingBalance)} · {row.currentOwnerLabel}
                </p>
                <button
                  type="button"
                  className={adminGiftPrimaryBtnClass("mt-2 min-h-[40px] w-full text-sm")}
                  style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                  data-admin-gift-instance-detail-open="1"
                  aria-pressed={id === row.id}
                  onClick={() => openDetail(row)}
                >
                  {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {selected && detail ? (
        <section
          className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-gift-instance-detail="1"
          data-admin-gift-instance-id={selected.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold font-mono">{selected.publicGiftNumber}</h2>
              <p className="text-sm">
                {selected.giftScope === "PLATFORM"
                  ? safeT("gift_ops_type_platform", {
                      fallbackKo: "DIBAY 상품권",
                      fallbackEn: "DIBAY Gift",
                    })
                  : safeT("gift_ops_type_store", {
                      fallbackKo: "매장 상품권",
                      fallbackEn: "Store Gift",
                    })}{" "}
                ·{" "}
                {selected.giftScope === "PLATFORM"
                  ? safeT("gift_ops_usable_platform", {
                      fallbackKo: "DIBAY eligible stores",
                      fallbackEn: "DIBAY eligible stores",
                    })
                  : selected.storeName}{" "}
                · {selected.productTitle} · {selected.status}
              </p>
              <p className="text-sm tabular-nums">
                Remaining {formatMoneyPhp(selected.remainingBalance)} / Face {formatMoneyPhp(selected.faceValue)}
              </p>
              <details className="mt-1 text-xs text-sam-muted">
                <summary>
                  {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
                </summary>
                <p className="mt-1 break-all font-mono">instance: {selected.id}</p>
                <p className="break-all font-mono">product: {selected.productId}</p>
                <p className="break-all font-mono">store: {selected.storeId}</p>
              </details>
            </div>
            <Link
              href={buildAdminGiftOpsHref({ tab: "instances", extra: { q: q || null, status: status || null } })}
              className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
            >
              {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
            </Link>
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_purchase", { fallbackKo: "발급 / 구매", fallbackEn: "Issuance / Purchase" })}
            </h3>
            <p className="mt-1 text-sm">
              Buyer: {selected.originalBuyerLabel} · {dt(selected.purchasedAt)} · D-Point{" "}
              {formatMoneyPhp(selected.purchasePrice)}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_ownership", { fallbackKo: "소유권", fallbackEn: "Ownership" })}
            </h3>
            <p className="mt-1 text-sm">
              Original: {selected.originalBuyerLabel} → Current: {selected.currentOwnerLabel}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-sam-muted">
              {detail.ownership.map((e) => (
                <li key={e.id}>
                  #{e.seq} {e.eventType}: {e.fromLabel || "—"} → {e.toLabel || "—"} · {dt(e.createdAt)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_transfer", { fallbackKo: "선물 이력", fallbackEn: "Transfer history" })}
            </h3>
            {detail.transfers.length === 0 ? (
              <p className="mt-1 text-sm text-sam-muted">—</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {detail.transfers.map((t) => (
                  <li key={t.id} className="rounded-ui-rect bg-sam-app p-2">
                    {t.senderLabel} → {t.recipientLabel} · {t.status} · {dt(t.offeredAt)}
                    {t.roomId ? (
                      <span className="block text-xs text-sam-muted">room {t.roomId.slice(0, 8)}…</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_redeem", { fallbackKo: "사용 / 수익", fallbackEn: "Redemption / Revenue" })}
            </h3>
            {detail.redemptions.length === 0 ? (
              <p className="mt-1 text-sm text-sam-muted">—</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {detail.redemptions.map((r) => (
                  <li key={r.id} className="rounded-ui-rect bg-sam-app p-2">
                    <p>
                      Order {r.orderNo || r.orderId} · {r.orderStatus || "—"} ·{" "}
                      {recognitionLabel(r.revenue, r.reversed)}
                    </p>
                    {r.redeemedStoreName || r.redeemedStoreId ? (
                      <p className="text-xs text-sam-muted">
                        {safeT("gift_ops_redeemed_store", {
                          fallbackKo: "사용 매장",
                          fallbackEn: "Redeemed store",
                        })}
                        : {r.redeemedStoreName || r.redeemedStoreId}
                      </p>
                    ) : null}
                    <p className="tabular-nums">
                      Used {formatMoneyPhp(r.usedAmount)} · Fee {r.feeRate}% {formatMoneyPhp(r.platformFee)} · Net{" "}
                      {formatMoneyPhp(r.merchantNet)}
                    </p>
                    <p className="text-xs text-sam-muted">{dt(r.createdAt)}</p>
                    {r.revenue.map((e) => (
                      <p key={e.id} className="text-xs text-sam-muted">
                        {e.entryType}: {formatMoneyPhp(e.amount)} · {dt(e.createdAt)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_settlement", { fallbackKo: "매장 정산", fallbackEn: "Store settlement" })}
            </h3>
            <p className="mt-1 text-sm tabular-nums">
              Available Gift Revenue: {formatMoneyPhp(detail.settlement?.availableRevenue ?? 0)}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {(detail.settlement?.cashOuts ?? []).map((c) => (
                <li key={c.id}>
                  외부 환전 {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                </li>
              ))}
              {(detail.settlement?.conversions ?? []).map((c) => (
                <li key={c.id}>
                  Store Cash 전환 {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Recovery</h3>
            {(detail.recovery ?? []).length === 0 ? (
              <p className="mt-1 text-sm text-sam-muted">
                {safeT("gift_ops_recovery_none", {
                  fallbackKo: "관련 Recovery 없음",
                  fallbackEn: "No related recovery",
                })}
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {(detail.recovery ?? []).map((r) => (
                  <li key={r.id}>
                    {r.linkage} · {formatMoneyPhp(r.amountRemaining)} / {formatMoneyPhp(r.amountOriginal)} ·{" "}
                    {r.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
