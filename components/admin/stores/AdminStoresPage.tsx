"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_STORE_STATUS_FILTER,
  type AdminStoreReviewRow,
} from "@/components/admin/stores/admin-store-review-model";
import {
  AdminStoreReviewTheme,
  ReviewRow,
} from "@/components/admin/stores/admin-store-review-ui";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  AdminStoreReviewPanel,
  adminStoreActionSuccessMessage,
} from "@/components/admin/stores/AdminStoreReviewPanel";
import { formatPhMobileDisplayPlus63, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & { sales_permission: SalesPerm };

const ADMIN_STORES_PAGE_SIZE = 30;

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
  const { t, language } = useI18n();
  const ko = language !== "en";
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
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [actionResult, setActionResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetStore, setSheetStore] = useState<AdminStoreRow | null>(null);
  const [searchText, setSearchText] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [page, setPage] = useState(() => {
    const n = Number(searchParams.get("page"));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  });
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(ADMIN_STORES_PAGE_SIZE);
  const rtRefreshTimeoutRef = useRef<number | null>(null);
  const firstFilterRunRef = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    // 필터·검색이 바뀌면 1페이지로 (첫 렌더는 URL page 유지).
    if (firstFilterRunRef.current) {
      firstFilterRunRef.current = false;
      return;
    }
    setPage(1);
  }, [filter, debouncedSearch]);

  /** 화면 URL (뒤로가기·상세 복귀용) — status·q·page */
  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (debouncedSearch) parts.push(`q=${encodeURIComponent(debouncedSearch)}`);
    if (page > 1) parts.push(`page=${page}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filter, debouncedSearch, page]);

  /** DEF-15 — 서버 페이지네이션 (전체 건수·상태별 건수는 서버 집계). */
  const apiQs = useMemo(() => {
    const parts = [`page=${page}`, `page_size=${ADMIN_STORES_PAGE_SIZE}`];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (debouncedSearch) parts.push(`q=${encodeURIComponent(debouncedSearch)}`);
    return `?${parts.join("&")}`;
  }, [filter, debouncedSearch, page]);

  useEffect(() => {
    const next = `/admin/stores${qs}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) window.history.replaceState(window.history.state, "", next);
  }, [qs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(undefined);
    try {
      const res = await fetch(`/api/admin/stores${apiQs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (res.status === 403) {
        setError("forbidden");
        setErrorStatus(403);
        setRows([]);
        setCounts({});
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setErrorStatus(res.status);
        setRows([]);
        setCounts({});
        setSheetStore(null);
        return;
      }
      const nextRows = (json.stores ?? []) as AdminStoreRow[];
      setRows(nextRows);
      setCounts(typeof json.counts === "object" && json.counts ? (json.counts as AdminStoreCounts) : {});
      setTotal(typeof json.total === "number" ? json.total : nextRows.length);
      setPageSize(typeof json.pageSize === "number" && json.pageSize > 0 ? json.pageSize : ADMIN_STORES_PAGE_SIZE);
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
  }, [apiQs]);

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
      .channel("admin-stores-list-freshness", messengerPrivateBroadcastChannelOptions())
      .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [load]);

  const runAction = async (storeId: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusyId(storeId);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setActionResult({
          ok: false,
          code: json?.error ?? (res.status === 403 ? "forbidden" : "action_failed"),
        });
        return false;
      }
      setActionResult({
        ok: true,
        message: adminStoreActionSuccessMessage(
          String(body.action ?? ""),
          ko,
          typeof body.enabled === "boolean" ? body.enabled : undefined
        ),
      });
      await load();
      return true;
    } catch {
      setActionResult({ ok: false, code: "network_error" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const returnToHere = `/admin/stores${qs}`;

  return (
    <AdminStoreReviewTheme>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-sam-border pb-4">
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
              <AdminChipButton
                key={f.value}
                selected={active}
                count={n}
                className="shrink-0"
                onClick={() => setFilter(f.value)}
              >
                {label}
              </AdminChipButton>
            );
          })}
        </div>

        <AdminResultBanner ko={ko} result={actionResult} onClose={() => setActionResult(null)} />

        <div className="overflow-hidden rounded-sm border border-sam-border bg-white">
          <div className="border-b border-sam-border bg-sam-surface-muted px-4 py-3">
            <label className="text-[12px] font-bold uppercase tracking-[0.08em] text-sam-fg">
              {t("common_search")}
            </label>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("admin_stores_search_placeholder")}
              className="mt-2 w-full rounded-sm border border-sam-border bg-white px-3 py-2 text-sam-fg outline-none focus:border-sam-primary"
            />
            <p className="mt-2 text-[13px] text-sam-muted">
              {loading ? t("common_loading") : error ? "—" : t("admin_stores_result_count", { count: total })}
            </p>
          </div>

          <div className="min-h-[50vh]">
            {loading ? (
              <div className="p-4">
                <AdminLoadingState ko={ko} />
              </div>
            ) : error ? (
              <div className="p-4">
                <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <AdminEmptyState ko={ko} message={t("admin_stores_empty_list")} />
              </div>
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
                  const approval = adminStatusLabel("store_approval", r.approval_status, ko);

                  return (
                    <div
                      key={r.id}
                      className={
                        active
                          ? "mx-3 my-4 overflow-hidden rounded-sm border-2 border-sam-primary bg-white shadow-[0_2px_10px_rgba(30,57,50,0.1)]"
                          : "border-b border-sam-border bg-white last:border-b-0"
                      }
                    >
                      <div className={`px-4 py-3 ${active ? "border-b border-sam-border bg-sam-surface-muted" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-[14px] font-bold leading-5 text-sam-fg">{storeName}</h2>
                              <AdminToneBadge tone={approval.tone}>{approval.label}</AdminToneBadge>
                              {r.approval_status === "pending" && (r.revision_note ?? "").trim() ? (
                                <AdminToneBadge tone="warning">{t("admin_r4a_resubmitted_badge")}</AdminToneBadge>
                              ) : null}
                            </div>

                            <div className="max-w-4xl space-y-0">
                              <ReviewRow
                                label={ko ? "신청자" : "Applicant"}
                                value={(r.applicant_nickname ?? "").trim() || "—"}
                              />
                              <ReviewRow
                                label={ko ? "공개 매장" : "Public page"}
                                value={
                                  <a
                                    href={publicHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sam-primary underline-offset-2 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {ko ? "공개 매장 보기" : "Open public page"}
                                  </a>
                                }
                              />
                              <ReviewRow
                                label={ko ? "전화" : "Phone"}
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
                              {kakaoLine ? <ReviewRow label={ko ? "카카오" : "Kakao"} value={kakaoLine} /> : null}
                              <ReviewRow
                                label={ko ? "요청사항" : "Request"}
                                value={requestPreview}
                                valueClassName="text-sam-muted"
                              />
                              <AdminTechDetails ko={ko}>
                                <div>store_id: {r.id}</div>
                                <div>owner: @{ownerHandle.replace(/^@/, "")}</div>
                                <div>url: /stores/{r.slug}</div>
                              </AdminTechDetails>
                            </div>
                          </div>

                          <AdminActionButton
                            variant={active ? "secondary" : "primary"}
                            size="sm"
                            onClick={() => setSheetStore((prev) => (prev?.id === r.id ? null : r))}
                            aria-expanded={active}
                          >
                            {active ? t("admin_stores_close_review") : t("admin_stores_open_review")}
                          </AdminActionButton>
                        </div>
                      </div>

                      {active ? (
                        <>
                          <div className="flex items-center border-b border-sam-primary/25 bg-sam-primary-soft px-4 py-2">
                            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-sam-primary">
                              {ko ? "심사 상세" : "Review detail"}
                            </span>
                          </div>
                          <div className="bg-sam-surface-muted">
                            <AdminStoreReviewPanel
                              store={r}
                              salesStatus={r.sales_permission?.sales_status ?? null}
                              detailHref={withAdminReturnTo(
                                `/admin/business/${encodeURIComponent(r.id)}`,
                                returnToHere
                              )}
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
          {!loading && !error && total > pageSize ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t border-sam-border bg-sam-surface-muted px-4 py-3"
              data-admin-stores-pagination="1"
            >
              <p className="text-[13px] text-sam-muted">
                {t("admin_biz_ops_page_range", {
                  from: String((page - 1) * pageSize + 1),
                  to: String(Math.min(page * pageSize, total)),
                  total: String(total),
                })}
              </p>
              <div className="flex items-center gap-1">
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("admin_biz_ops_page_prev")}
                </AdminActionButton>
                <span className="px-2 text-[13px] tabular-nums text-sam-fg">
                  {page} / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("admin_biz_ops_page_next")}
                </AdminActionButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AdminStoreReviewTheme>
  );
}
