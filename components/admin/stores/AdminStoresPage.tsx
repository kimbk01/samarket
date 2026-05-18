"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  ADMIN_STORE_STATUS_FILTER,
  type AdminStoreReviewRow,
} from "@/components/admin/stores/admin-store-review-model";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const AdminStoreReviewSheetLazy = dynamic(
  () =>
    import("@/components/admin/stores/AdminStoreReviewSheet").then((m) => m.AdminStoreReviewSheet),
  { ssr: false }
);

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & { sales_permission: SalesPerm };

type AdminStoreCounts = Partial<Record<(typeof ADMIN_STORE_STATUS_FILTER)[number]["value"], number>>;

function previewText(text: string | null | undefined, max = 56): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function AdminStoresPage() {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<AdminStoreRow[]>([]);
  const [counts, setCounts] = useState<AdminStoreCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetStore, setSheetStore] = useState<AdminStoreRow | null>(null);
  const [searchText, setSearchText] = useState("");
  const [realtimeBadge, setRealtimeBadge] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);
  const rtRefreshTimeoutRef = useRef<number | null>(null);

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    const q = searchText.trim();
    if (q) parts.push(`q=${encodeURIComponent(q)}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filter, searchText]);

  const errorText =
    error === "forbidden"
      ? t("admin_audit_err_no_permission")
      : error === "network_error"
        ? t("common_network_error")
        : error;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        setCounts({});
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        setCounts({});
        setSheetStore(null);
        return;
      }
      const nextRows = (json.stores ?? []) as AdminStoreRow[];
      setRows(nextRows);
      setCounts(typeof json.counts === "object" && json.counts ? (json.counts as AdminStoreCounts) : {});
      setSheetStore((prev) => {
        if (prev && nextRows.some((r) => r.id === prev.id)) {
          return nextRows.find((r) => r.id === prev.id) ?? prev;
        }
        return prev;
      });
    } catch {
      setError("network_error");
      setRows([]);
      setCounts({});
      setSheetStore(null);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const scheduleRefresh = () => {
      setRealtimeBadge(true);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      setToast(true);
      toastTimeoutRef.current = window.setTimeout(() => {
        toastTimeoutRef.current = null;
        setToast(false);
      }, 3500);

      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      rtRefreshTimeoutRef.current = window.setTimeout(() => {
        rtRefreshTimeoutRef.current = null;
        void runSingleFlight("admin:stores:realtime-refresh", () => load());
      }, 250);
    };

    const channel = sb
      .channel("admin-stores-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stores" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [load]);

  const runAction = async (storeId: string, body: Record<string, unknown>) => {
    setBusyId(storeId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? `action_failed_${res.status}`);
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "rejected":
        return "bg-red-50 text-red-800 border-red-200";
      case "suspended":
        return "bg-orange-50 text-orange-950 border-orange-200";
      case "revision_requested":
        return "bg-amber-50 text-amber-950 border-amber-200";
      case "under_review":
        return "bg-sky-50 text-sky-900 border-sky-200";
      case "pending":
      default:
        return "bg-sam-app text-sam-muted border-sam-border";
    }
  };

  const approvalLabel = (status: string) => {
    const key = ADMIN_STORE_APPROVAL_LABEL_KEYS[status];
    return key ? t(key) : status;
  };

  return (
    <div className="space-y-4">
      {sheetStore ? (
        <AdminStoreReviewSheetLazy
          store={sheetStore}
          onClose={() => setSheetStore(null)}
          onRunAction={(action, payload) => {
            const id = sheetStore.id;
            void runAction(id, {
              action,
              ...(payload?.reason ? { reason: payload.reason } : {}),
              ...(payload?.enabled !== undefined ? { enabled: payload.enabled } : {}),
              ...(payload?.store_name ? { store_name: payload.store_name } : {}),
            });
          }}
          actionBusy={busyId === sheetStore.id}
          onSetOwnerIdentityEditable={(enabled) => {
            const id = sheetStore.id;
            void runAction(id, { action: "set_owner_identity_editable", enabled });
          }}
          identityActionBusy={busyId === sheetStore.id}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AdminPageHeader titleKey="admin_page_store_review_queue" />
          {toast ? (
            <div className="mt-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 sam-text-body-secondary text-sky-900">
              {t("admin_stores_toast_new_application")}
            </div>
          ) : null}
        </div>
        {realtimeBadge ? (
          <button
            type="button"
            onClick={() => {
              setRealtimeBadge(false);
              void load();
            }}
            className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 sam-text-xxs font-bold text-sky-900 animate-pulse"
            title={t("admin_stores_realtime_refresh_title")}
          >
            NEW
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {ADMIN_STORE_STATUS_FILTER.map((f) => {
          const label = t(f.labelKey);
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1.5 sam-text-body-secondary font-medium ${
                filter === f.value
                  ? "bg-sam-ink text-white"
                  : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{label}</span>
                <span
                  className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-2 py-0.5 sam-text-xxs font-bold ${
                    filter === f.value ? "bg-white/15 text-white" : "bg-sam-app text-sam-muted"
                  }`}
                  aria-label={t("admin_stores_filter_count_aria", { label })}
                >
                  {Number.isFinite(Number(counts[f.value])) ? Number(counts[f.value]) : 0}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {errorText ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {errorText}
        </div>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_stores_empty_list")}
        </div>
      ) : (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border-soft p-3">
            <label className="sam-text-xxs font-bold uppercase tracking-wide text-sam-muted">
              {t("common_search")}
            </label>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("admin_stores_search_placeholder")}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg"
            />
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {t("admin_stores_result_count", { count: rows.length })}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-left sam-text-body-secondary">
              <thead className="border-b border-sam-border bg-sam-app sam-text-helper text-sam-muted">
                <tr>
                  <th className="min-w-[220px] px-3 py-2 font-medium">{t("admin_stores_th_store")}</th>
                  <th className="min-w-[120px] px-3 py-2 font-medium">{t("admin_stores_th_status")}</th>
                  <th className="min-w-[80px] px-3 py-2 font-medium">{t("admin_stores_th_visible")}</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">{t("admin_stores_th_owner_id")}</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">{t("admin_stores_th_contact")}</th>
                  <th className="min-w-[180px] px-3 py-2 font-medium">{t("admin_stores_th_intro")}</th>
                  <th className="min-w-[140px] px-3 py-2 font-medium">{t("admin_stores_th_region")}</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">{t("admin_stores_th_applied_at")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const { intro: introForList, kakao: kakaoForList } = splitStoreDescriptionAndKakao(
                    r.description,
                    r.kakao_id
                  );
                  const ownerHandle = String((r as { owner_handle?: string }).owner_handle ?? "").trim() || r.slug;
                  const phoneLine = (r.phone ?? "").trim();
                  const kakaoLine = (kakaoForList ?? "").trim();
                  const contactLine = [phoneLine, kakaoLine].filter(Boolean).join(" · ") || "—";
                  const regionLine = (() => {
                    const reg = String(r.region ?? "").trim();
                    const city = String(r.city ?? "").trim();
                    return [reg, city].filter(Boolean).join(" · ") || "—";
                  })();
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-sam-border-soft hover:bg-sam-app cursor-pointer"
                      onClick={() => setSheetStore(r)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-sam-fg">
                          {(r.store_name ?? "").trim() || t("admin_stores_no_store_name")}
                        </div>
                        <div className="mt-1 font-mono sam-text-xxs text-sam-muted">{r.slug}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 sam-text-xxs font-bold ${statusBadgeClass(
                            r.approval_status
                          )}`}
                          title={r.approval_status}
                        >
                          {approvalLabel(r.approval_status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 sam-text-xxs font-bold ${
                            r.is_visible
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-sam-border bg-sam-app text-sam-muted"
                          }`}
                        >
                          {r.is_visible ? "Y" : "N"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top font-mono sam-text-xxs text-sam-fg break-all">
                        {ownerHandle}
                      </td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-fg">{contactLine}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">
                        {previewText(introForList, 84)}
                      </td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">{regionLine}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">
                        {new Date(r.created_at).toLocaleString(locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
