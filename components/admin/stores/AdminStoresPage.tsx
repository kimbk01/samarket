"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  ADMIN_STORE_STATUS_FILTER,
  type AdminStoreReviewRow,
} from "@/components/admin/stores/admin-store-review-model";
import {
  AdminStoreReviewTheme,
  ReviewRow,
  sbBtnPrimary,
  sbBtnSecondary,
  sbStatusBadgeClass,
} from "@/components/admin/stores/admin-store-review-ui";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { AdminStoreReviewPanel } from "@/components/admin/stores/AdminStoreReviewPanel";
import { formatPhMobileDisplayPlus63, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & { sales_permission: SalesPerm };

type AdminStoreCounts = Partial<Record<(typeof ADMIN_STORE_STATUS_FILTER)[number]["value"], number>>;

function previewText(text: string | null | undefined, max = 72): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function countValue(counts: AdminStoreCounts, key: string): number {
  const n = Number(counts[key as keyof AdminStoreCounts]);
  return Number.isFinite(n) ? n : 0;
}

function displayAdminPhone(raw: string | null | undefined): string {
  const formatted = formatPhMobileDisplayPlus63(raw ?? "");
  return formatted || (raw ?? "").trim() || "—";
}

export function AdminStoresPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(() => {
    const status = searchParams.get("status")?.trim() ?? "";
    if (ADMIN_STORE_STATUS_FILTER.some((f) => f.value === status)) return status;
    return "all";
  });
  const [rows, setRows] = useState<AdminStoreRow[]>([]);
  const [counts, setCounts] = useState<AdminStoreCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetStore, setSheetStore] = useState<AdminStoreRow | null>(null);
  const [searchText, setSearchText] = useState(() => searchParams.get("q")?.trim() ?? "");
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
        return null;
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
      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      rtRefreshTimeoutRef.current = window.setTimeout(() => {
        rtRefreshTimeoutRef.current = null;
        void runSingleFlight("admin:stores:realtime-refresh", () => load());
      }, 250);
    };

    const channel = sb
      .channel("admin-stores-list-freshness")
      .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [load]);

  const runAction = async (storeId: string, body: Record<string, unknown>): Promise<boolean> => {
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
        return false;
      }
      await load();
      return true;
    } catch {
      setError("network_error");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const approvalLabel = (status: string) => {
    const key = ADMIN_STORE_APPROVAL_LABEL_KEYS[status];
    return key ? t(key) : status;
  };

  return (
    <AdminStoreReviewTheme>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-[#D4C5B9] pb-4">
          <div className="min-w-0 flex-1">
            <AdminPageHeader titleKey="admin_page_store_review_queue" />
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {ADMIN_STORE_STATUS_FILTER.map((f) => {
            const label = t(f.labelKey);
            const n = countValue(counts, f.value);
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`min-w-[7.5rem] shrink-0 rounded-sm border px-3 py-2 text-left transition ${
                  active
                    ? "border-[#00704A] bg-[#00704A] text-white"
                    : "border-[#D4C5B9] bg-white text-[#1E3932] hover:bg-[#F2F0EB]"
                }`}
              >
                <span className="block text-[12px] font-medium leading-4 opacity-90">{label}</span>
                <span className="mt-0.5 block text-[20px] font-semibold leading-none tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        {errorText ? (
          <div className="rounded-sm border border-[#EF9A9A] bg-[#FFEBEE] px-3 py-2 text-[13px] font-medium text-[#B71C1C]">
            {errorText}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-sm border border-[#D4C5B9] bg-white">
          <div className="border-b border-[#D4C5B9] bg-[#F2F0EB] px-4 py-3">
            <label className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#1E3932]">
              {t("common_search")}
            </label>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("admin_stores_search_placeholder")}
              className="mt-2 w-full rounded-sm border border-[#D4C5B9] bg-white px-3 py-2 text-[#1E3932] outline-none focus:border-[#00704A]"
            />
            <p className="mt-2 text-[13px] text-[#6B6B6B]">
              {loading ? t("common_loading") : t("admin_stores_result_count", { count: rows.length })}
            </p>
          </div>

          <div className="min-h-[50vh]">
            {loading ? (
              <p className="p-6 text-[14px] text-[#6B6B6B]">{t("common_loading")}</p>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-[14px] text-[#6B6B6B]">{t("admin_stores_empty_list")}</div>
            ) : (
              <div>
                {rows.map((r) => {
                  const { kakao: kakaoForList } = splitStoreDescriptionAndKakao(r.description, r.kakao_id);
                  const ownerHandle = String((r as { owner_handle?: string }).owner_handle ?? "").trim() || r.slug;
                  const phoneLine = displayAdminPhone(r.phone);
                  const phoneHref = telHrefFromLoosePhPhone(r.phone);
                  const kakaoLine = (kakaoForList ?? "").trim();
                  const requestPreview = previewText(
                    (r as { application_request_note?: string | null }).application_request_note
                  );
                  const active = sheetStore?.id === r.id;
                  const publicHref = `/stores/${encodeURIComponent(r.slug)}`;
                  const storeName = (r.store_name ?? "").trim() || t("admin_stores_no_store_name");

                  return (
                    <div
                      key={r.id}
                      className={
                        active
                          ? "mx-3 my-4 overflow-hidden rounded-sm border-2 border-[#00704A] bg-white shadow-[0_2px_10px_rgba(30,57,50,0.1)]"
                          : "border-b border-[#D4C5B9] bg-white last:border-b-0"
                      }
                    >
                      <div className={`px-4 py-3 ${active ? "border-b border-[#D4C5B9] bg-[#FAFAF8]" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-[15px] font-bold leading-5 text-[#1E3932]">{storeName}</h2>
                              <span
                                className={`rounded-sm border px-2 py-0.5 text-[12px] font-medium ${sbStatusBadgeClass(
                                  r.approval_status
                                )}`}
                              >
                                {approvalLabel(r.approval_status)}
                              </span>
                            </div>

                            <div className="max-w-4xl space-y-0">
                              <ReviewRow
                                label="신청ID"
                                value={`@${ownerHandle.replace(/^@/, "")}`}
                              />
                              <ReviewRow
                                label="매장URL"
                                value={
                                  <a
                                    href={publicHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#00704A] underline-offset-2 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    stores/{r.slug}
                                  </a>
                                }
                              />
                              <ReviewRow
                                label="전화"
                                value={
                                  phoneHref ? (
                                    <a href={phoneHref} className="underline-offset-2 hover:underline">
                                      {phoneLine}
                                    </a>
                                  ) : (
                                    phoneLine
                                  )
                                }
                              />
                              {kakaoLine ? <ReviewRow label="카카오" value={kakaoLine} /> : null}
                              <ReviewRow label="요청사항" value={requestPreview} valueClassName="text-[#6B6B6B]" />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSheetStore((prev) => (prev?.id === r.id ? null : r))}
                            className={active ? sbBtnSecondary : sbBtnPrimary}
                            aria-expanded={active}
                          >
                            {active ? t("admin_stores_close_review") : t("admin_stores_open_review")}
                          </button>
                        </div>
                      </div>

                      {active ? (
                        <>
                          <div className="flex items-center border-b border-[#00704A]/25 bg-[#E8F2ED] px-4 py-2">
                            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#00704A]">
                              심사 상세
                            </span>
                          </div>
                          <div className="bg-[#F2F0EB]">
                            <AdminStoreReviewPanel
                              store={r}
                              onRunAction={(action, payload) =>
                                runAction(r.id, {
                                  action,
                                  ...(payload?.reason ? { reason: payload.reason } : {}),
                                  ...(payload?.enabled !== undefined ? { enabled: payload.enabled } : {}),
                                  ...(payload?.store_name ? { store_name: payload.store_name } : {}),
                                })
                              }
                              actionBusy={busyId === r.id}
                              onSetOwnerIdentityEditable={(enabled) => {
                                void runAction(r.id, { action: "set_owner_identity_editable", enabled });
                              }}
                              identityActionBusy={busyId === r.id}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminStoreReviewTheme>
  );
}
