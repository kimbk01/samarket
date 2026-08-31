"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

type ChargeRequest = {
  id: string;
  ownerUserId: string;
  amountMinor: number;
  requestStatus: string;
  ownerMemo: string | null;
  createdAt: string;
};

export function AdminDeliveryAdCashChargeQueuePage() {
  const { t, safeT } = useI18n();
  const [rows, setRows] = useState<ChargeRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        "/api/admin/delivery-ads/business-cash/charge-requests?status=open",
        { credentials: "include" }
      );
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
      setRows(json.requests ?? []);
    } catch {
      setError("network");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "complete" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/admin/delivery-ads/business-cash/charge-requests/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "action_failed");
        return;
      }
      await load();
    } catch {
      setError("network");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 p-4" data-admin-delivery-ads-cash-charges="1">
      <div>
        <h1 className="text-[20px] font-bold text-sam-fg">
          {safeT("admin_delivery_ads_cash_charges_title", {
            fallbackKo: "Business Cash 충전 신청",
            fallbackEn: "Business Cash top-up requests",
          })}
        </h1>
        <p className="mt-1 text-[13px] text-sam-muted">
          {safeT("admin_delivery_ads_cash_charges_help", {
            fallbackKo:
              "확인 후 적립하면 광고 Business Cash ledger에만 반영됩니다. Business Credit과 분리됩니다.",
            fallbackEn:
              "Confirm credits ads Business Cash ledger only. Separate from Business Credit.",
          })}
        </p>
      </div>
      <AdminCard
        title={safeT("admin_delivery_ads_cash_charges_title", {
          fallbackKo: "Business Cash 충전 신청",
          fallbackEn: "Business Cash top-up requests",
        })}
      >        {!loaded ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("common_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_empty", {
              fallbackKo: "대기 중인 충전 신청이 없습니다.",
              fallbackEn: "No open top-up requests.",
            })}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-sam-fg">
                    {formatDeliveryAdPhpMinor(r.amountMinor)}
                  </p>
                  <p className="truncate text-[12px] text-sam-muted">{r.ownerUserId}</p>
                  {r.ownerMemo ? (
                    <p className="mt-1 text-[12px] text-sam-muted">{r.ownerMemo}</p>
                  ) : null}
                  <p className="text-[11px] text-sam-muted">{r.createdAt.slice(0, 19)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="min-h-[36px] rounded-ui-rect border border-[#0A823E] px-3 text-[12px] font-semibold text-[#0A823E]"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "complete")}
                    data-admin-cash-charge-complete={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_complete", {
                      fallbackKo: "적립 확인",
                      fallbackEn: "Credit",
                    })}
                  </button>
                  <button
                    type="button"
                    className="min-h-[36px] rounded-ui-rect border border-red-300 px-3 text-[12px] font-semibold text-red-700"
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
