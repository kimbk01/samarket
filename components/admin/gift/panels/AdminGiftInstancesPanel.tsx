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

type ListStatus = "loading" | "error" | "empty" | "ready";
type DetailStatus = "idle" | "loading" | "ready" | "error";

const STATUS_OPTIONS = ["", "ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED", "FULLY_REDEEMED", "SUSPENDED"];

const TRACKING_API = "/api/admin/gift-certificates/tracking";

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

function buildTrackingQuery(args: { q?: string; status?: string; id?: string }): string {
  const qs = new URLSearchParams();
  if (args.q?.trim()) qs.set("q", args.q.trim());
  if (args.status?.trim()) qs.set("status", args.status.trim());
  if (args.id?.trim()) qs.set("id", args.id.trim());
  return qs.toString();
}

function findInstanceRow(rows: InstanceRow[], needle: string): InstanceRow | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  return rows.find((r) => r.id === trimmed || r.publicGiftNumber === trimmed.toUpperCase()) ?? null;
}

function mergeInstanceRow(rows: InstanceRow[], row: InstanceRow): InstanceRow[] {
  if (rows.some((r) => r.id === row.id)) return rows;
  return [row, ...rows];
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

  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>("idle");
  const [focusInstanceId, setFocusInstanceId] = useState(urlInstanceId);

  const listAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailSeqRef = useRef(0);
  const activeDetailIdRef = useRef("");

  useEffect(() => {
    setDraftQ(urlQ);
    setDraftStatus(urlStatus);
  }, [urlQ, urlStatus]);

  useEffect(() => {
    setFocusInstanceId(urlInstanceId);
  }, [urlInstanceId]);

  const effectiveInstanceId = focusInstanceId.trim() || urlInstanceId.trim();

  const fetchList = useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    setListStatus("loading");
    const query = buildTrackingQuery({ q: urlQ, status: urlStatus });

    try {
      const res = await fetch(`${TRACKING_API}?${query}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setRows([]);
      setListStatus("error");
    }
  }, [urlQ, urlStatus]);

  const fetchInstanceDetail = useCallback(
    async (instanceId: string) => {
      const trimmed = instanceId.trim();
      if (!trimmed) return;

      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const seq = ++detailSeqRef.current;
      activeDetailIdRef.current = trimmed;

      setDetailStatus("loading");
      const query = buildTrackingQuery({ q: urlQ, status: urlStatus, id: trimmed });

      try {
        const res = await fetch(`${TRACKING_API}?${query}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (seq !== detailSeqRef.current) return;

        const json = (await res.json()) as {
          ok?: boolean;
          instances?: InstanceRow[];
          detail?: TrackingDetail | null;
        };
        if (!res.ok || !json.ok || !json.detail) {
          if (activeDetailIdRef.current === trimmed) {
            setDetail(null);
            setDetailStatus("error");
          }
          return;
        }

        if (seq !== detailSeqRef.current || activeDetailIdRef.current !== trimmed) return;

        setDetail(json.detail);
        setRows((prev) => mergeInstanceRow(prev, json.detail!.instance));
        setDetailStatus("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (seq !== detailSeqRef.current || activeDetailIdRef.current !== trimmed) return;
        setDetail(null);
        setDetailStatus("error");
      }
    },
    [urlQ, urlStatus]
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const trimmed = effectiveInstanceId.trim();
    if (!trimmed) {
      activeDetailIdRef.current = "";
      detailSeqRef.current += 1;
      detailAbortRef.current?.abort();
      setDetail(null);
      setDetailStatus("idle");
      return;
    }
    void fetchInstanceDetail(trimmed);
  }, [effectiveInstanceId, fetchInstanceDetail]);

  const selectedRow = useMemo(() => {
    if (detail?.instance && detail.instance.id === effectiveInstanceId) return detail.instance;
    return findInstanceRow(rows, effectiveInstanceId);
  }, [detail, effectiveInstanceId, rows]);

  const applySearch = () => {
    setFocusInstanceId("");
    router.push(
      buildAdminGiftOpsHref({
        tab: "instances",
        extra: { q: draftQ.trim() || null, status: draftStatus.trim() || null },
      })
    );
  };

  const openProductEdit = (row: InstanceRow) => {
    router.push(
      buildAdminGiftOpsHref({
        tab: "products",
        products: "products",
        extra: { id: row.productId, edit: "1" },
      })
    );
  };

  const openInstanceTrace = (row: InstanceRow) => {
    setFocusInstanceId(row.id);
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

  const productEditHref = (productId: string) =>
    buildAdminGiftOpsHref({
      tab: "products",
      products: "products",
      extra: { id: productId, edit: "1" },
    });

  const closeDetailHref = buildAdminGiftOpsHref({
    tab: "instances",
    extra: { q: urlQ || null, status: urlStatus || null },
  });

  const showDetailShell = Boolean(effectiveInstanceId && selectedRow);

  return (
    <div className="space-y-4" data-admin-gift-instances="1">
      <p className="text-xs text-sam-muted">
        {safeT("gift_ops_instance_list_hint", {
          fallbackKo: "「상세」는 상품권 상품 설정(제목·가격·판매기간) 수정입니다. 「추적」은 개별 발급 이력 조회입니다.",
          fallbackEn: "Detail opens product settings (title, price, sales window). Trace shows one issued certificate history.",
        })}
      </p>
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
                    <td className="px-2 py-2">{row.giftScope === "PLATFORM" ? "DIBAY" : row.storeName || "—"}</td>
                    <td className="px-2 py-2">{row.productTitle || "—"}</td>
                    <td className="px-2 py-2">{row.originalBuyerLabel || "—"}</td>
                    <td className="px-2 py-2">{row.currentOwnerLabel || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.faceValue)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(row.remainingBalance)}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2 text-xs text-sam-muted">{dt(row.purchasedAt || row.createdAt)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={adminGiftPrimaryBtnClass("min-h-[36px] px-3 text-xs")}
                          style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                          data-admin-gift-instance-detail-open="1"
                          onClick={() => openProductEdit(row)}
                        >
                          {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                        </button>
                        <button
                          type="button"
                          className={`${Sam.btn.secondary} min-h-[36px] px-3 text-xs`}
                          data-admin-gift-instance-trace-open="1"
                          aria-pressed={effectiveInstanceId === row.id}
                          onClick={() => openInstanceTrace(row)}
                        >
                          {safeT("gift_ops_cta_trace", { fallbackKo: "추적", fallbackEn: "Trace" })}
                        </button>
                      </div>
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
                <p className="text-sm">
                  {row.storeName} · {row.productTitle}
                </p>
                <p className="text-xs text-sam-muted">
                  {row.status} · rem {formatMoneyPhp(row.remainingBalance)} · {row.currentOwnerLabel}
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className={adminGiftPrimaryBtnClass("min-h-[40px] w-full text-sm")}
                    style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                    data-admin-gift-instance-detail-open="1"
                    onClick={() => openProductEdit(row)}
                  >
                    {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                  </button>
                  <button
                    type="button"
                    className={`${Sam.btn.secondary} min-h-[40px] w-full text-sm`}
                    data-admin-gift-instance-trace-open="1"
                    aria-pressed={effectiveInstanceId === row.id}
                    onClick={() => openInstanceTrace(row)}
                  >
                    {safeT("gift_ops_cta_trace", { fallbackKo: "추적", fallbackEn: "Trace" })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {showDetailShell && selectedRow ? (
        <section
          className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-gift-instance-detail="1"
          data-admin-gift-instance-id={selectedRow.id}
          data-admin-gift-instance-detail-status={detailStatus}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold font-mono">{selectedRow.publicGiftNumber}</h2>
              <p className="text-sm">
                {selectedRow.giftScope === "PLATFORM"
                  ? safeT("gift_ops_type_platform", {
                      fallbackKo: "DIBAY 상품권",
                      fallbackEn: "DIBAY Gift",
                    })
                  : safeT("gift_ops_type_store", {
                      fallbackKo: "매장 상품권",
                      fallbackEn: "Store Gift",
                    })}{" "}
                ·{" "}
                {selectedRow.giftScope === "PLATFORM"
                  ? safeT("gift_ops_usable_platform", {
                      fallbackKo: "DIBAY eligible stores",
                      fallbackEn: "DIBAY eligible stores",
                    })
                  : selectedRow.storeName}{" "}
                · {selectedRow.productTitle} · {selectedRow.status}
              </p>
              <p className="text-sm tabular-nums">
                Remaining {formatMoneyPhp(selectedRow.remainingBalance)} / Face {formatMoneyPhp(selectedRow.faceValue)}
              </p>
              <details className="mt-1 text-xs text-sam-muted">
                <summary>
                  {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
                </summary>
                <p className="mt-1 break-all font-mono">instance: {selectedRow.id}</p>
                <p className="break-all font-mono">product: {selectedRow.productId}</p>
                <p className="break-all font-mono">store: {selectedRow.storeId}</p>
              </details>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={productEditHref(selectedRow.productId)}
                className={adminGiftPrimaryBtnClass("min-h-[40px] px-3 text-sm")}
                style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                data-admin-gift-instance-product-edit="1"
              >
                {safeT("gift_ops_cta_edit_product", {
                  fallbackKo: "상품 설정 수정",
                  fallbackEn: "Edit product settings",
                })}
              </Link>
              <Link href={closeDetailHref} className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}>
                {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
              </Link>
            </div>
          </div>

          {detailStatus === "loading" ? (
            <p className="text-sm text-sam-muted" aria-live="polite" data-admin-gift-instance-detail-loading="1">
              {safeT("gift_ops_instance_detail_loading", {
                fallbackKo: "상세 이력을 불러오는 중…",
                fallbackEn: "Loading instance detail…",
              })}
            </p>
          ) : null}

          {detailStatus === "error" ? (
            <div className="space-y-2" data-admin-gift-instance-detail-error="1">
              <p className="text-sm text-red-600">
                {safeT("gift_ops_instance_detail_error", {
                  fallbackKo: "상품권 상세를 불러오지 못했습니다.",
                  fallbackEn: "Couldn’t load gift instance detail.",
                })}
              </p>
              <button
                type="button"
                className={Sam.btn.secondary}
                onClick={() => void fetchInstanceDetail(selectedRow.id)}
              >
                {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
              </button>
            </div>
          ) : null}

          {detailStatus === "ready" && detail ? (
            <>
              <div>
                <h3 className="text-sm font-semibold">
                  {safeT("gift_ops_sec_purchase", { fallbackKo: "발급 / 구매", fallbackEn: "Issuance / Purchase" })}
                </h3>
                <p className="mt-1 text-sm">
                  Buyer: {selectedRow.originalBuyerLabel} · {dt(selectedRow.purchasedAt)} · D-Point{" "}
                  {formatMoneyPhp(selectedRow.purchasePrice)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  {safeT("gift_ops_sec_ownership", { fallbackKo: "소유권", fallbackEn: "Ownership" })}
                </h3>
                <p className="mt-1 text-sm">
                  Original: {selectedRow.originalBuyerLabel} → Current: {selectedRow.currentOwnerLabel}
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
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
