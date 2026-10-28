"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
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

/** 목록 조건 = 주소 (`status`·`q`·`page`·`size`) — 대시보드 딥링크 `?status=` 그대로 호환. */
const STORE_STATUS_VALUES = ADMIN_STORE_STATUS_FILTER.map((f) => f.value).filter((v) => v !== "all");
const LIST_CONFIG = { statuses: STORE_STATUS_VALUES };

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
  const pathname = usePathname() ?? "/admin/stores";
  const lq = useAdminListQuery(LIST_CONFIG);
  const filter = lq.query.status || "all";
  const router = useRouter();
  /** G-01 — 유형·업종·노출 필터 (주소 조건 kind·category·visibility) */
  const kindFilter = searchParams?.get("kind") ?? "";
  const visibilityFilter = searchParams?.get("visibility") ?? "";
  const categoryFilter = searchParams?.get("category") ?? "";
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/stores/taxonomy", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { primaries?: Array<{ id?: string; name?: string; nameKo?: string }>; categories?: Array<{ id?: string; name?: string }> }) => {
        if (cancelled) return;
        const list = (j.categories ?? j.primaries ?? [])
          .map((c) => ({ id: String(c.id ?? ""), name: String((c as { name?: string; nameKo?: string }).name ?? (c as { nameKo?: string }).nameKo ?? "") }))
          .filter((c) => c.id && c.name);
        setCategories(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const setClassFilter = useCallback(
    (key: "kind" | "visibility" | "category", value: string) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (value) sp.set(key, value);
      else sp.delete(key);
      sp.delete("page");
      router.replace(`${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [pathname, router, searchParams]
  );
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
  const page = lq.query.page;
  const pageSize = lq.query.size;
  const search = lq.query.q;
  const [total, setTotal] = useState(0);
  const rtRefreshTimeoutRef = useRef<number | null>(null);

  /** 화면 URL (뒤로가기·상세 복귀용) — useAdminListQuery 가 주소에 쓴 조건 그대로. */
  const spKey = searchParams?.toString() ?? "";
  const qs = spKey ? `?${spKey}` : "";

  /** DEF-15 — 서버 페이지네이션 (전체 건수·상태별 건수는 서버 집계). */
  const apiQs = useMemo(() => {
    const parts = [`page=${page}`, `page_size=${pageSize}`];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (search) parts.push(`q=${encodeURIComponent(search)}`);
    if (kindFilter) parts.push(`kind=${encodeURIComponent(kindFilter)}`);
    if (visibilityFilter) parts.push(`visibility=${encodeURIComponent(visibilityFilter)}`);
    if (categoryFilter) parts.push(`category=${encodeURIComponent(categoryFilter)}`);
    return `?${parts.join("&")}`;
  }, [filter, search, page, pageSize, kindFilter, visibilityFilter, categoryFilter]);

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
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setError(json?.error ?? "load_failed");
        setErrorStatus(res.status);
        return;
      }
      const nextRows = (json.stores ?? []) as AdminStoreRow[];
      setRows(nextRows);
      setCounts(typeof json.counts === "object" && json.counts ? (json.counts as AdminStoreCounts) : {});
      setTotal(typeof json.total === "number" ? json.total : nextRows.length);
      setSheetStore((prev) => {
        if (prev && nextRows.some((r) => r.id === prev.id)) {
          return nextRows.find((r) => r.id === prev.id) ?? prev;
        }
        return null;
      });
    } catch {
      setError("network_error");
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

  const returnToHere = `${pathname}${qs}`;

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
                onClick={() => lq.setStatus(f.value === "all" ? "" : f.value)}
              >
                {label}
              </AdminChipButton>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" data-admin-stores-class-filters="1">
          <Link
            href="/admin/stores/samples"
            className="mr-2 text-[13px] font-semibold text-sam-primary hover:underline"
            data-admin-stores-samples-link="1"
          >
            {t("admin_stores_kind_sample")} →
          </Link>
          {[
            { v: "", label: t("admin_stores_kind_all") },
            { v: "real", label: t("admin_stores_kind_real") },
            { v: "sample", label: t("admin_stores_kind_sample") },
            { v: "legacy_test", label: t("admin_stores_kind_legacy_test") },
          ].map((o) => (
            <AdminChipButton
              key={`kind-${o.v || "all"}`}
              selected={kindFilter === o.v}
              className="shrink-0"
              onClick={() => setClassFilter("kind", o.v)}
            >
              {o.label}
            </AdminChipButton>
          ))}
          <span className="mx-1 h-4 w-px bg-sam-border" aria-hidden />
          {[
            { v: "", label: t("admin_stores_visibility_all") },
            { v: "visible", label: t("admin_stores_visibility_visible") },
            { v: "hidden", label: t("admin_stores_visibility_hidden") },
          ].map((o) => (
            <AdminChipButton
              key={`vis-${o.v || "all"}`}
              selected={visibilityFilter === o.v}
              className="shrink-0"
              onClick={() => setClassFilter("visibility", o.v)}
            >
              {o.label}
            </AdminChipButton>
          ))}
          <select
            className="sam-input h-8 rounded-ui-rect px-2 text-[13px]"
            aria-label={t("admin_stores_category_filter")}
            value={categoryFilter}
            onChange={(e) => setClassFilter("category", e.target.value)}
          >
            <option value="">{t("admin_stores_category_all")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <AdminResultBanner ko={ko} result={actionResult} onClose={() => setActionResult(null)} />

        <div className="overflow-hidden rounded-sm border border-sam-border bg-white">
          <div className="border-b border-sam-border bg-sam-surface-muted px-4 py-3">
            <AdminFilterBar
              ko={ko}
              draft={lq.draft}
              onDraftChange={lq.setDraft}
              onSubmit={lq.submit}
              onReset={lq.reset}
              pending={loading}
              showPeriod={false}
              searchPlaceholder={t("admin_stores_search_placeholder")}
            />
            <p className="mt-2 text-[13px] text-sam-muted">
              {loading ? t("common_loading") : error ? "—" : t("admin_stores_result_count", { count: total })}
            </p>
          </div>

          <div className="min-h-[50vh]">
            {error ? (
              <div className="p-4">
                <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
              </div>
            ) : null}
            {loading && rows.length === 0 ? (
              <div className="p-4">
                <AdminLoadingState ko={ko} />
              </div>
            ) : rows.length === 0 ? (
              error ? null : (
                <div className="p-4">
                  <AdminEmptyState
                    ko={ko}
                    message={lq.isFiltered ? undefined : t("admin_stores_empty_list")}
                    onReset={lq.isFiltered ? lq.reset : undefined}
                  />
                </div>
              )
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
                              {r.store_kind === "sample" ? (
                                <AdminToneBadge tone="progress">{t("admin_stores_kind_sample")}</AdminToneBadge>
                              ) : r.store_kind === "legacy_test" ? (
                                <AdminToneBadge tone="waiting">{t("admin_stores_kind_legacy_test")}</AdminToneBadge>
                              ) : null}
                              <AdminToneBadge tone={r.is_visible ? "success" : "neutral"}>
                                {r.is_visible ? t("admin_stores_visibility_visible") : t("admin_stores_visibility_hidden")}
                              </AdminToneBadge>
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
                            variant="ghost"
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
                                  ...(payload?.expected_core_info_changed_at !== undefined
                                    ? { expected_core_info_changed_at: payload.expected_core_info_changed_at }
                                    : {}),
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
          {rows.length > 0 ? (
            <div className="border-t border-sam-border bg-sam-surface-muted px-4" data-admin-stores-pagination="1">
              <AdminPagination
                ko={ko}
                page={page}
                size={pageSize}
                total={total}
                onPageChange={lq.setPage}
                onSizeChange={lq.setSize}
                disabled={loading}
              />
            </div>
          ) : null}
        </div>
      </div>
    </AdminStoreReviewTheme>
  );
}
