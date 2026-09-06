"use client";

/**
 * CUT B — Cash top-up queue wired to canonical AST-005 API.
 * Legacy `/api/admin/delivery-ads/business-cash/charge-requests` PATCH stays 410 (NO_NEW_WRITE).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

type ChargeRequest = {
  id: string;
  store_id: string;
  owner_user_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
  reject_reason?: string | null;
};

type ActionResult = {
  ok: boolean;
  error?: string;
  idempotent?: boolean;
  ledgerId?: string;
  balanceAfterMinor?: number;
};

export function AdminDeliveryAdCashChargeQueuePage() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const focusRequestId = (searchParams.get("requestId") ?? "").trim();
  const [rows, setRows] = useState<ChargeRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Deep-link requestId may point at a decided row — load all when focusing.
      const statusQ = focusRequestId ? "all" : "PENDING";
      const res = await fetch(`/api/admin/business-cash-charges?status=${encodeURIComponent(statusQ)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        requests?: ChargeRequest[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setLoaded(true);
        return;
      }
      let next = json.requests ?? [];
      if (focusRequestId) {
        const hit = next.find((r) => r.id === focusRequestId);
        const pending = next.filter((r) => String(r.status).toUpperCase() === "PENDING");
        next = hit
          ? [hit, ...pending.filter((r) => r.id !== hit.id)]
          : pending;
      }
      setRows(next);
    } catch {
      setError("network");
    } finally {
      setLoaded(true);
    }
  }, [focusRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || !focusRequestId) return;
    const el = document.querySelector(`[data-admin-cash-charge-row="${CSS.escape(focusRequestId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-admin-cash-charge-focus", "1");
      el.classList.add("ring-2", "ring-signature");
    }
  }, [loaded, focusRequestId, rows]);

  const act = async (id: string, op: "approve" | "reject") => {
    setBusyId(id);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/business-cash-charges", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          requestId: id,
          reason: op === "reject" ? "admin_rejected" : undefined,
        }),
      });
      const json = (await res.json()) as ActionResult;
      if (!res.ok || !json.ok) {
        setError(
          json.error
            ? String(json.error)
            : safeT("admin_delivery_ads_cash_charges_action_failed", {
                fallbackKo: "Cash 충전 처리에 실패했습니다. 잔액·원장은 변경되지 않았을 수 있습니다.",
                fallbackEn:
                  "Cash top-up action failed. Balance/ledger may be unchanged.",
              })
        );
        return;
      }
      if (op === "approve") {
        setSuccess(
          safeT("admin_delivery_ads_cash_charges_approve_ok", {
            fallbackKo: json.idempotent
              ? "이미 처리된 충전입니다. Cash 원장은 중복 적립되지 않았습니다."
              : `적립 완료. 원장 ${json.ledgerId ?? ""} · 잔액 ${formatDeliveryAdPhpMinor(json.balanceAfterMinor ?? 0)}`,
            fallbackEn: json.idempotent
              ? "Already processed. Cash ledger was not double-credited."
              : `Credited. Ledger ${json.ledgerId ?? ""} · balance ${formatDeliveryAdPhpMinor(json.balanceAfterMinor ?? 0)}`,
          })
        );
      } else {
        setSuccess(
          safeT("admin_delivery_ads_cash_charges_reject_ok", {
            fallbackKo: "거절 완료. Cash 잔액은 변경되지 않았습니다.",
            fallbackEn: "Rejected. Cash balance was not changed.",
          })
        );
      }
      await load();
    } catch {
      setError("network");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="space-y-4 p-4"
      data-admin-delivery-ads-cash-charges="1"
      data-admin-cash-charges-canonical="1"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CurrencyBadge currency="cash" />
            <h1 className="text-[20px] font-bold text-sam-fg">
              {safeT("admin_delivery_ads_cash_charges_title", {
                fallbackKo: "Cash 충전 신청",
                fallbackEn: "Cash top-up requests",
              })}
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_help", {
              fallbackKo:
                "확인 후 적립하면 Cash 원장에만 반영됩니다. Coin·Point와 분리됩니다. 광고비도 Cash만 사용합니다.",
              fallbackEn:
                "Confirmation credits the Cash ledger only — separate from Coin and Point. Ads also spend Cash only.",
            })}
          </p>
        </div>
        <Link
          href="/admin/finance"
          className="min-h-[36px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
        >
          {safeT("admin_delivery_ads_cash_charges_finance_hub", {
            fallbackKo: "Finance 허브",
            fallbackEn: "Finance hub",
          })}
        </Link>
      </div>

      {success ? (
        <p
          className="rounded-ui-rect border border-[#0A823E]/40 bg-[#0A823E]/10 px-3 py-2 text-[13px] text-[#0A823E]"
          role="status"
          data-admin-cash-charge-success="1"
        >
          {success}
        </p>
      ) : null}

      <AdminCard
        title={safeT("admin_delivery_ads_cash_charges_title", {
          fallbackKo: "Cash 충전 신청",
          fallbackEn: "Cash top-up requests",
        })}
      >
        {!loaded ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("common_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : error ? (
          <p className="text-[13px] text-red-600" role="alert" data-admin-cash-charge-error="1">
            {error === "network"
              ? safeT("common_network_error", {
                  fallbackKo: "네트워크 오류가 발생했습니다.",
                  fallbackEn: "A network error occurred.",
                })
              : error}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_empty", {
              fallbackKo: "대기 중인 Cash 충전 신청이 없습니다.",
              fallbackEn: "No open Cash top-up requests.",
            })}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                data-admin-cash-charge-row={r.id}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-sam-fg">
                    {formatDeliveryAdPhpMinor(r.amount_minor)}
                  </p>
                  <p className="truncate text-[12px] text-sam-muted">
                    {safeT("admin_delivery_ads_cash_charges_store", {
                      fallbackKo: "매장",
                      fallbackEn: "Store",
                    })}
                    : {r.store_id}
                  </p>
                  <p className="truncate text-[12px] text-sam-muted">{r.owner_user_id}</p>
                  <p className="text-[11px] text-sam-muted">
                    {String(r.created_at ?? "").slice(0, 19)} · {r.status}
                  </p>
                  <Link
                    href={`/admin/finance?storeId=${encodeURIComponent(r.store_id)}&view=statement`}
                    className="mt-1 inline-block text-[12px] font-semibold text-[var(--currency-cash-accent)] hover:underline"
                  >
                    {safeT("admin_delivery_ads_cash_charges_open_statement", {
                      fallbackKo: "매장 재무 명세서",
                      fallbackEn: "Store financial statement",
                    })}
                  </Link>
                  <Link
                    href={`/admin/finance?storeId=${encodeURIComponent(r.store_id)}`}
                    className="mt-1 ml-2 inline-block text-[12px] font-semibold text-[var(--currency-cash-accent)] hover:underline"
                  >
                    {safeT("admin_delivery_ads_cash_charges_open_store", {
                      fallbackKo: "매장 Cash/Coin 보기",
                      fallbackEn: "Open store Cash/Coin",
                    })}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-[40px] rounded-ui-rect border border-[#0A823E] px-3 text-[12px] font-semibold text-[#0A823E]"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "approve")}
                    data-admin-cash-charge-complete={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_complete", {
                      fallbackKo: "입금 확인 · 적립",
                      fallbackEn: "Confirm · Credit",
                    })}
                  </button>
                  <button
                    type="button"
                    className="min-h-[40px] rounded-ui-rect border border-red-300 px-3 text-[12px] font-semibold text-red-700"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "reject")}
                    data-admin-cash-charge-reject={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_reject", {
                      fallbackKo: "거절",
                      fallbackEn: "Reject",
                    })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
