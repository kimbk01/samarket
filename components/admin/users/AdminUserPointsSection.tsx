"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointLedgerEntry, PointChargeRequest } from "@/lib/types/point";
import { PointChargeBadge } from "@/components/points/PointChargeBadge";
import { AdminCard } from "@/components/admin/AdminCard";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

interface AdminUserPointsSectionProps {
  userId: string;
}

const LEDGER_TYPE_KEYS: Record<string, MessageKey> = {
  charge: "admin_users_points_ledger_charge",
  spend: "admin_users_points_ledger_spend",
  refund: "admin_users_points_ledger_refund",
  admin_adjust: "admin_users_points_ledger_admin_adjust",
  expire: "admin_users_points_ledger_expire",
  reward: "admin_users_points_ledger_reward",
  reverse: "admin_users_points_ledger_reverse",
  ad_purchase: "admin_users_points_ledger_ad_purchase",
  ad_refund: "admin_users_points_ledger_ad_refund",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminUserPointsSection({ userId }: AdminUserPointsSectionProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<PointLedgerEntry[]>([]);
  const [charges, setCharges] = useState<PointChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"ledger" | "charges">("charges");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/points`);
      const j = (await res.json()) as {
        balance?: number;
        ledger?: PointLedgerEntry[];
        chargeRequests?: PointChargeRequest[];
      };
      setBalance(j.balance ?? 0);
      setLedger(j.ledger ?? []);
      setCharges(j.chargeRequests ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doAction = async (reqId: string, action: "approve" | "reject" | "hold") => {
    setBusy(reqId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/point-charges/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_users_action_failed"));
        return;
      }
      void load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <AdminCard titleKey="admin_users_points_title">
        <p className="sam-text-body-secondary text-sam-meta">{t("admin_dashboard_loading")}</p>
      </AdminCard>
    );
  }

  const pendingCount = charges.filter(
    (c) => c.requestStatus === "pending" || c.requestStatus === "waiting_confirm" || c.requestStatus === "on_hold"
  ).length;

  return (
    <AdminCard titleKey="admin_users_points_manage_title">
      <div className="mb-4 flex items-center justify-between rounded-ui-rect bg-sky-50 px-4 py-3">
        <div>
          <p className="sam-text-helper text-sky-700">{t("admin_users_points_balance")}</p>
          <p className="sam-text-hero font-bold text-sky-800">{(balance ?? 0).toLocaleString()}P</p>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2.5 py-1 sam-text-helper font-bold text-white">
            {t("admin_users_points_pending", { count: pendingCount })}
          </span>
        )}
      </div>

      {err ? <p className="mb-2 sam-text-helper text-red-600">{err}</p> : null}

      <div className="mb-3 flex gap-1 rounded-ui-rect bg-sam-surface-muted p-1">
        {(["charges", "ledger"] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`flex-1 rounded-ui-rect py-1.5 sam-text-helper font-semibold transition-colors ${
              tab === tabKey ? "bg-sam-surface text-sam-fg shadow-sm" : "text-sam-muted"
            }`}
          >
            {tabKey === "charges"
              ? t("admin_users_points_tab_charges", { count: charges.length })
              : t("admin_users_points_tab_ledger", { count: ledger.length })}
          </button>
        ))}
      </div>

      {tab === "charges" && (
        <div>
          {charges.length === 0 ? (
            <p className="py-4 text-center sam-text-helper text-sam-meta">{t("admin_users_points_charges_empty")}</p>
          ) : (
            <div className="space-y-2">
              {charges.map((c) => {
                const canAct =
                  c.requestStatus === "pending" ||
                  c.requestStatus === "waiting_confirm" ||
                  c.requestStatus === "on_hold";
                return (
                  <div
                    key={c.id}
                    className={`rounded-ui-rect border px-3 py-3 ${
                      c.requestStatus === "waiting_confirm"
                        ? "border-amber-200 bg-amber-50"
                        : "border-sam-border-soft bg-sam-app"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="sam-text-body-secondary font-semibold text-sam-fg">{c.planName}</p>
                        <p className="sam-text-helper text-sky-700 font-bold">+{c.pointAmount.toLocaleString()}P</p>
                        <p className="sam-text-xxs text-sam-muted">
                          ₱{c.paymentAmount.toLocaleString()} ·{" "}
                          {c.paymentMethod === "manual_confirm"
                            ? t("admin_users_points_payment_manual")
                            : t("admin_users_points_payment_transfer")}
                          {c.depositorName ? ` · ${c.depositorName}` : ""}
                        </p>
                        <p className="sam-text-xxs text-sam-meta">
                          {new Date(c.requestedAt).toLocaleString(dateLocale)}
                        </p>
                        {c.adminMemo && (
                          <p className="mt-1 sam-text-xxs text-amber-700">{t("admin_users_memo_prefix")} {c.adminMemo}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <PointChargeBadge status={c.requestStatus} />
                        {canAct && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={busy === c.id}
                              onClick={() => void doAction(c.id, "approve")}
                              className="rounded bg-emerald-600 px-2 py-1 sam-text-xxs font-bold text-white disabled:opacity-50"
                            >
                              {t("admin_ads_action_approve")}
                            </button>
                            <button
                              type="button"
                              disabled={busy === c.id}
                              onClick={() => void doAction(c.id, "reject")}
                              className="rounded bg-red-500 px-2 py-1 sam-text-xxs font-bold text-white disabled:opacity-50"
                            >
                              {t("admin_ads_action_reject")}
                            </button>
                            {c.requestStatus !== "on_hold" && (
                              <button
                                type="button"
                                disabled={busy === c.id}
                                onClick={() => void doAction(c.id, "hold")}
                                className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-muted disabled:opacity-50"
                              >
                                {t("admin_users_points_action_hold")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "ledger" && (
        <div>
          {ledger.length === 0 ? (
            <p className="py-4 text-center sam-text-helper text-sam-meta">{t("admin_users_points_ledger_empty")}</p>
          ) : (
            <div className="divide-y divide-sam-border-soft">
              {ledger.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 sam-text-xxs font-semibold ${
                          l.amount >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {t(LEDGER_TYPE_KEYS[l.entryType] ?? "admin_users_points_ledger_charge")}
                      </span>
                      <p className="truncate sam-text-helper text-sam-fg">{l.description}</p>
                    </div>
                    <p className="sam-text-xxs text-sam-meta">
                      {new Date(l.createdAt).toLocaleString(dateLocale)}
                    </p>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <p className={`sam-text-body-secondary font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                    </p>
                    <p className="sam-text-xxs text-sam-meta">{l.balanceAfter.toLocaleString()}P</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminCard>
  );
}
