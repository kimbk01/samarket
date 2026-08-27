"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type Row = {
  id: string;
  usedAt: string;
  customerLabel: string;
  storeName: string;
  publicGiftNumber: string;
  instanceId: string;
  productTitle: string;
  orderId: string;
  orderNo: string | null;
  orderStatus: string | null;
  gross: number;
  feeRate: number;
  platformFee: number;
  merchantNet: number;
  recognitionState: string;
};

const FILTERS = [
  { id: "all", ko: "전체", en: "All" },
  { id: "pending", ko: "주문 진행 / 확정 대기", en: "Pending recognition" },
  { id: "recognized", ko: "수익 확정", en: "Recognized" },
  { id: "reversed", ko: "환불/역분개", en: "Refund / reversal" },
] as const;

function dt(v: string): string {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export function AdminGiftRedemptionsPanel({ filter, q: initialQ }: { filter: string; q: string }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const activeFilter = FILTERS.some((f) => f.id === filter) ? filter : "all";
  const [q, setQ] = useState(initialQ);
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = new URLSearchParams();
      qs.set("filter", activeFilter);
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(`/api/admin/gift-certificates/redemptions?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; redemptions?: Row[] };
      if (!res.ok || !json.ok) {
        setRows([]);
        setState("error");
        return;
      }
      const list = json.redemptions ?? [];
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setRows([]);
      setState("error");
    }
  }, [activeFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-gift-redemptions="1">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={buildAdminGiftOpsHref({
              tab: "redemptions",
              extra: { filter: f.id, q: q.trim() || null },
            })}
            className={[
              "rounded-ui-rect px-3 py-2 text-sm font-semibold",
              activeFilter === f.id ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
            ].join(" ")}
            data-redemption-filter={f.id}
          >
            {safeT(`gift_ops_red_filter_${f.id}`, { fallbackKo: f.ko, fallbackEn: f.en })}
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Store / Gift # / Customer / Order"
        />
        <button
          type="button"
          className={`${Sam.btn.primary} min-h-[44px]`}
          onClick={() =>
            router.push(
              buildAdminGiftOpsHref({
                tab: "redemptions",
                extra: { filter: activeFilter, q: q.trim() || null },
              })
            )
          }
        >
          {safeT("gift_ops_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_red_error", {
              fallbackKo: "사용 내역을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load redemptions.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_red_empty", {
            fallbackKo: "사용 내역이 없습니다.",
            fallbackEn: "No redemptions yet.",
          })}
        </p>
      ) : null}

      {state === "data" ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Used</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Gift #</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Gross</th>
                  <th className="px-2 py-2">Fee</th>
                  <th className="px-2 py-2">Net</th>
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Revenue</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2 text-xs">{dt(r.usedAt)}</td>
                    <td className="px-2 py-2">{r.customerLabel || "—"}</td>
                    <td className="px-2 py-2">{r.storeName || "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{r.publicGiftNumber || "—"}</td>
                    <td className="px-2 py-2">{r.productTitle || "—"}</td>
                    <td className="px-2 py-2">{r.orderNo || r.orderId.slice(0, 8)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.gross)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.feeRate}% / {formatMoneyPhp(r.platformFee)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.merchantNet)}</td>
                    <td className="px-2 py-2">{r.orderStatus || "—"}</td>
                    <td className="px-2 py-2 uppercase">{r.recognitionState}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={buildAdminGiftOpsHref({
                          tab: "instances",
                          extra: { id: r.instanceId || r.publicGiftNumber || null },
                        })}
                        className={`${Sam.btn.secondary} inline-flex min-h-[36px] items-center px-3 text-xs`}
                      >
                        {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <p className="font-mono text-sm">{r.publicGiftNumber}</p>
                <p className="text-sm">
                  {r.storeName} · {r.customerLabel} · {formatMoneyPhp(r.gross)}
                </p>
                <p className="text-xs text-sam-muted">
                  {r.recognitionState} · {r.orderStatus} · {dt(r.usedAt)}
                </p>
                <Link
                  href={buildAdminGiftOpsHref({
                    tab: "instances",
                    extra: { id: r.instanceId || r.publicGiftNumber || null },
                  })}
                  className={`${Sam.btn.secondary} mt-2 flex min-h-[40px] items-center justify-center`}
                >
                  {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
