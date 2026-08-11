"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

type BlockedStore = {
  id: string;
  store_name: string;
  point_balance: number;
};

type Summary = {
  blocked_store_count?: number;
  pending_charge_count?: number;
  blocked_stores?: BlockedStore[];
};

type StoreRow = {
  id: string;
  store_name: string;
  point_balance: number;
  point_commerce_blocked: boolean;
};

export function AdminStorePointsOverviewPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [storesLoading, setStoresLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adjustBusy, setAdjustBusy] = useState<string | null>(null);
  const [draftDelta, setDraftDelta] = useState<Record<string, string>>({});
  const [draftMemo, setDraftMemo] = useState<Record<string, string>>({});
  const [storeTotal, setStoreTotal] = useState(0);
  const [storeOffset, setStoreOffset] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(tmr);
  }, [search]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/store-points/summary", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setSummary(json?.summary ?? null);
    } catch {
      /* summary optional */
    }
  }, []);

  const loadStores = useCallback(
    async (opts?: { append?: boolean; offset?: number }) => {
      const append = opts?.append === true;
      const offset = opts?.offset ?? 0;
      setStoresLoading(true);
      if (!append) setErr("");
      try {
        const qs = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (searchDebounced) qs.set("q", searchDebounced);
        const res = await fetch(`/api/admin/store-points?${qs}`, { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: StoreRow[];
          total?: number;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_points_load_failed"));
          if (!append) setStores([]);
          return;
        }
        const batch = json.stores ?? [];
        setStoreTotal(Number(json.total) || 0);
        setStoreOffset(offset + batch.length);
        setStores((prev) => (append ? [...prev, ...batch] : batch));
      } catch {
        setErr(t("common_network_error"));
        if (!append) setStores([]);
      } finally {
        setStoresLoading(false);
      }
    },
    [searchDebounced, t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSummary(), loadStores()]);
    setLoading(false);
  }, [loadSummary, loadStores]);

  useEffect(() => {
    void load();
  }, [load]);

  const adjust = async (storeId: string) => {
    const delta = Math.trunc(Number(draftDelta[storeId]));
    if (!Number.isFinite(delta) || delta === 0) return;
    setAdjustBusy(storeId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/store-points/${encodeURIComponent(storeId)}/adjust`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delta,
          memo: draftMemo[storeId] ?? "",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; result?: { balance_after?: number } };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_points_adjust_failed"));
        return;
      }
      setDraftDelta((d) => ({ ...d, [storeId]: "" }));
      void loadSummary();
      void loadStores({ offset: 0 });
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setAdjustBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_points" />

      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{summary?.blocked_store_count ?? 0}</p>
            <p className="text-xs text-sam-muted">{t("admin_store_points_blocked_count")}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center">
            <p className="text-2xl font-bold text-[#006241]">{summary?.pending_charge_count ?? 0}</p>
            <p className="text-xs text-sam-muted">{t("admin_store_points_pending_charges")}</p>
          </div>
        </div>
      )}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sam-fg">{t("admin_store_points_store_list")}</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin_store_points_search_ph")}
            className="w-full max-w-xs rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          />
        </div>

        {storesLoading ? (
          <p className="mt-3 text-sm text-sam-muted">{t("common_loading")}</p>
        ) : stores.length === 0 ? (
          <p className="mt-3 text-sm text-sam-muted">{t("admin_store_points_blocked_empty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-sam-border text-left text-xs text-sam-muted">
                  <th className="py-2 pr-2">{t("admin_store_points_col_name")}</th>
                  <th className="py-2 pr-2">{t("admin_store_points_col_balance")}</th>
                  <th className="py-2 pr-2">{t("admin_store_points_col_status")}</th>
                  <th className="py-2">{t("admin_store_points_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b border-sam-border-soft align-top">
                    <td className="py-2 pr-2 font-medium text-sam-fg">{s.store_name}</td>
                    <td className="py-2 pr-2 tabular-nums font-semibold text-[#006241]">
                      {s.point_balance.toLocaleString()}P
                    </td>
                    <td className="py-2 pr-2">
                      {s.point_commerce_blocked ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                          {t("admin_store_points_status_blocked")}
                        </span>
                      ) : (
                        <span className="text-xs text-sam-muted">{t("admin_store_points_status_ok")}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          <input
                            type="number"
                            className="w-24 rounded border border-sam-border px-2 py-1 text-xs"
                            placeholder={t("admin_store_points_adjust_delta_ph")}
                            value={draftDelta[s.id] ?? ""}
                            onChange={(e) =>
                              setDraftDelta((d) => ({ ...d, [s.id]: e.target.value }))
                            }
                          />
                          <input
                            type="text"
                            className="min-w-[100px] flex-1 rounded border border-sam-border px-2 py-1 text-xs"
                            placeholder={t("admin_store_points_adjust_memo_ph")}
                            value={draftMemo[s.id] ?? ""}
                            onChange={(e) =>
                              setDraftMemo((d) => ({ ...d, [s.id]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={adjustBusy === s.id}
                            className="rounded-ui-rect bg-[#006241] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() => void adjust(s.id)}
                          >
                            {t("admin_store_points_adjust_submit")}
                          </button>
                          <Link
                            href={`/admin/store-point-charges?storeId=${encodeURIComponent(s.id)}`}
                            className="rounded-ui-rect border border-sam-border px-2 py-1 text-xs font-semibold text-sam-fg"
                          >
                            {t("admin_store_points_link_charges")}
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!storesLoading && stores.length < storeTotal ? (
          <button
            type="button"
            className="mt-3 w-full rounded-ui-rect border border-sam-border py-2 text-sm font-semibold text-sam-fg"
            onClick={() => void loadStores({ append: true, offset: storeOffset })}
          >
            {t("admin_store_points_load_more")}
          </button>
        ) : null}
      </section>

      {(summary?.blocked_stores ?? []).length > 0 ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="font-semibold text-sam-fg">{t("admin_store_points_blocked_list")}</h2>
          <ul className="mt-2 divide-y divide-sam-border-soft">
            {(summary?.blocked_stores ?? []).map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-sm">
                <span>{s.store_name}</span>
                <span className="font-semibold tabular-nums">{s.point_balance}P</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
