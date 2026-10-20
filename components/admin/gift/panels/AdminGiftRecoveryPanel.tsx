"use client";

import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import {
  r5DeliveryStatusLabel,
  GIFT_RECOVERY_STATUS_NAMESPACE,
} from "@/lib/admin/status-labels/r5-delivery-status-labels";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { Sam } from "@/lib/ui/css-vars";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

type Obligation = {
  id: string;
  storeId: string;
  storeName: string;
  redemptionId: string | null;
  publicGiftNumber: string | null;
  orderId: string | null;
  linkage: "REDEMPTION" | "POOL_LEVEL";
  amountOriginal: number;
  amountRemaining: number;
  recoveredAmount: number;
  status: string;
  storeCashBalance: number;
  createdAt: string;
  clearedAt: string | null;
};

function dt(v: string | null): string {
  if (!v) return "—";
  try {
    return formatAdminManilaDateTime(v);
  } catch {
    return v;
  }
}

export function AdminGiftRecoveryPanel({ id }: { id: string }) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [rows, setRows] = useState<Obligation[]>([]);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const sourceLabel = (r: Obligation) =>
    r.linkage === "POOL_LEVEL" ? (ko ? "풀 단위" : "Pool level") : ko ? "상품권 사용" : "Redemption";

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/gift-certificates/recovery", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; obligations?: Obligation[] } | null;
      if (!res.ok || !json?.ok) {
        setLoadErr({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        setState("error");
        return;
      }
      setLoadErr(null);
      const list = json.obligations ?? [];
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setLoadErr({ code: "network_error" });
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((r) => r.id === id) ?? null;

  return (
    <div className="space-y-4" data-admin-gift-recovery-ops="1">
      {/* DEF-35: 처리 API 는 이전 기록 전용(410) — 조회만 제공 */}
      <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-xs text-sam-muted">
        {ko
          ? "이전 기록 조회 전용입니다. 회수 기록은 더 이상 이 화면에서 처리하지 않습니다."
          : "Historical records — view only. Recovery records are no longer processed here."}
      </p>
      {state === "loading" ? <AdminLoadingState ko={ko} /> : null}
      {state === "error" ? (
        <AdminErrorState ko={ko} code={loadErr?.code ?? "load_failed"} httpStatus={loadErr?.status} onRetry={() => void load()} />
      ) : null}
      {state === "empty" ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("gift_u6_recovery_empty", {
            fallbackKo: "회수 기록이 없습니다.",
            fallbackEn: "No open recovery obligations.",
          })}
        />
      ) : null}

      {state === "data" ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">{ko ? "매장" : "Store"}</th>
                  <th className="px-2 py-2">{ko ? "금액" : "Amount"}</th>
                  <th className="px-2 py-2">{ko ? "발생 유형" : "Source"}</th>
                  <th className="px-2 py-2">{ko ? "상품권 번호" : "Gift #"}</th>
                  <th className="px-2 py-2">{ko ? "상태" : "Status"}</th>
                  <th className="px-2 py-2">{ko ? "회수됨" : "Recovered"}</th>
                  <th className="px-2 py-2">{ko ? "남은 금액" : "Remaining"}</th>
                  <th className="px-2 py-2">{ko ? "당시 환산 금액" : "Historical converted amount"}</th>
                  <th className="px-2 py-2">{ko ? "생성 일시" : "Created"}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2 font-semibold">{r.storeName || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(r.amountOriginal)}</td>
                    <td className="px-2 py-2">{sourceLabel(r)}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.linkage === "POOL_LEVEL" ? "—" : r.publicGiftNumber || "—"}
                    </td>
                    <td className="px-2 py-2">{r5DeliveryStatusLabel(GIFT_RECOVERY_STATUS_NAMESPACE, r.status, ko)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(r.recoveredAmount)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(r.amountRemaining)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(r.storeCashBalance)}</td>
                    <td className="px-2 py-2 text-xs">{dt(r.createdAt)}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={buildAdminGiftOpsHref({ tab: "recovery", extra: { id: r.id } })}
                        className={`${Sam.btn.secondary} inline-flex min-h-[36px] items-center px-3 text-xs`}
                      >
                        {ko ? "상세 보기" : "View"}
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
                <p className="font-semibold">{r.storeName}</p>
                <p className="text-sm tabular-nums">
                  {ko ? "남은 금액" : "Remaining"} {formatAdminPhp(r.amountRemaining)} ·{" "}
                  {r.linkage === "POOL_LEVEL" ? sourceLabel(r) : r.publicGiftNumber}
                </p>
                <Link
                  href={buildAdminGiftOpsHref({ tab: "recovery", extra: { id: r.id } })}
                  className={`${Sam.btn.secondary} mt-2 flex min-h-[40px] items-center justify-center`}
                >
                  {ko ? "상세 보기" : "View"}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {selected ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <AdminActionButton
            variant="ghost"
            size="sm"
            className="!px-0"
            onClick={() => router.push(buildAdminGiftOpsHref({ tab: "recovery" }))}
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </AdminActionButton>
          <p className="font-semibold">{selected.storeName}</p>
          <p className="text-sm">
            {selected.linkage === "POOL_LEVEL"
              ? sourceLabel(selected)
              : `${ko ? "상품권" : "Gift"} ${selected.publicGiftNumber ?? "—"}`}{" "}
            · {r5DeliveryStatusLabel(GIFT_RECOVERY_STATUS_NAMESPACE, selected.status, ko)}
          </p>
          <p className="text-sm tabular-nums">
            {ko ? "남은 금액" : "Remaining"} {formatAdminPhp(selected.amountRemaining)} ·{" "}
            {ko ? "당시 환산 금액" : "Historical converted amount"} {formatAdminPhp(selected.storeCashBalance)}
          </p>
          <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-xs text-sam-muted">
            {ko ? "이전 기록 조회 전용 — 처리할 수 없습니다." : "Historical record — view only."}
          </p>
          <details className="text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
            </summary>
            <p className="break-all font-mono">{selected.id}</p>
            {selected.orderId ? <p className="break-all font-mono">order_id: {selected.orderId}</p> : null}
          </details>
        </section>
      ) : null}
    </div>
  );
}
