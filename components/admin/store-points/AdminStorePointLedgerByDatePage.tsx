"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  groupStorePointLedgerByDate,
  type StorePointLedgerRow,
} from "@/lib/stores/group-store-point-ledger-by-date";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";

const TYPE_KEYS: Record<string, MessageKey> = {
  store_order_fee: "admin_store_point_ledger_type_store_order_fee",
  store_charge: "admin_store_point_ledger_type_store_charge",
  admin_adjust: "admin_store_point_ledger_type_admin_adjust",
  refund: "admin_store_point_ledger_type_refund",
  bonus: "admin_store_point_ledger_type_bonus",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function AdminStorePointLedgerByDatePage() {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);

  const [dateFrom, setDateFrom] = useState(() => daysAgoIso(7));
  const [dateTo, setDateTo] = useState(() => todayIsoDate());
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ id: string; store_name: string }[]>([]);
  const [entries, setEntries] = useState<StorePointLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/store-points?limit=200", { credentials: "include" });
      const json = (await res.json()) as {
        stores?: { id: string; store_name: string }[];
      };
      setStores(json.stores ?? []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ dateFrom, dateTo });
      if (storeId.trim()) qs.set("storeId", storeId.trim());
      const res = await fetch(`/api/admin/store-point-ledger?${qs}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        entries?: StorePointLedgerRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t));
        setEntries([]);
        return;
      }
      setEntries(json.entries ?? []);
    } catch {
      setErr(t("common_network_error"));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupStorePointLedgerByDate(entries), [entries]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_point_ledger" />
      <p className="text-sm text-sam-muted">{t("admin_store_point_ledger_desc")}</p>

      <div className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-sam-muted">
          {t("admin_store_point_ledger_date_from")}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_store_point_ledger_date_to")}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted sm:col-span-2">
          {t("admin_store_point_ledger_store_all")}
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">{t("admin_store_point_ledger_store_all")}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            className="rounded-ui-rect bg-[#006241] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => void load()}
          >
            {t("admin_store_point_ledger_apply")}
          </button>
        </div>
      </div>

      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_store_point_ledger_empty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section
              key={g.dateKey}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 border-b border-sam-border-soft pb-2">
                <h2 className="font-semibold text-sam-fg">{g.dateKey}</h2>
                <p className="text-sm text-sam-muted">
                  {t("admin_store_point_ledger_day_total")}:{" "}
                  <span
                    className={`font-semibold tabular-nums ${g.totalAmount >= 0 ? "text-[#006241]" : "text-red-600"}`}
                  >
                    {g.totalAmount > 0 ? "+" : ""}
                    {g.totalAmount.toLocaleString()}P
                  </span>
                </p>
              </div>
              <ul className="mt-2 divide-y divide-sam-border-soft">
                {g.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <span className="text-sam-fg">
                      {e.storeName || e.storeId} ·{" "}
                      {TYPE_KEYS[e.entryType]
                        ? t(TYPE_KEYS[e.entryType])
                        : t("common_content_unavailable")}
                      {e.description ? (
                        <span className="ml-1 text-xs text-sam-muted">({e.description})</span>
                      ) : null}
                      <span className="ml-2 text-xs text-sam-muted">
                        {new Date(e.createdAt).toLocaleString(locale)}
                      </span>
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${e.amount < 0 ? "text-red-600" : "text-[#006241]"}`}
                    >
                      {e.amount > 0 ? "+" : ""}
                      {e.amount}P → {e.balanceAfter}P
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
