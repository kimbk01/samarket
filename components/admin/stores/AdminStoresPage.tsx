"use client";

/**
 * 입점 심사 (`/admin/stores`) — 5-E 신청 처리 전용 시트.
 * - 기본 필터 = 승인 대기(입점 검토 대기 · actionable), 상태 칩 유지.
 * - 실매장 신청만: API `scope=review` 가 쿼리 단계에서 샘플(`store_kind='sample'`)을 뺀다.
 * - 한 행 = 신청 1건 (표 = `AdminManagementTableViewport`, 「매장 운영」 표와 같은 열 스타일). 정렬(신청일·상태)·페이지.
 * - 행 클릭 = 상세 드로어(기존 심사 패널)에서 승인·반려 등 (기존 PATCH API·확인 팝업 그대로).
 * - 매장 유형 필터·일괄 노출/삭제/공통 수정은 「매장 운영」(`/admin/business`, 5-A)으로 이동했다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";
import {
  ADMIN_STORE_STATUS_FILTER,
  type AdminStoreReviewRow,
  type TaxonomyRelation,
} from "@/components/admin/stores/admin-store-review-model";
import { AdminStoreReviewTheme } from "@/components/admin/stores/admin-store-review-ui";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  AdminStoreReviewPanel,
  adminStoreActionSuccessMessage,
  confirmAdminStoreAction,
} from "@/components/admin/stores/AdminStoreReviewPanel";
import { allowedStoreApprovalActions } from "@/lib/admin-business/admin-store-decision-rules";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { ADMIN_STORES_SORTS } from "@/lib/admin-business/admin-stores-list-query";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & {
  sales_permission: SalesPerm;
  /** 5-E — 입점 심사 결정 감사 기록 최신 1건 (scope=review) */
  review_decided_at?: string | null;
  review_decided_action?: string | null;
  review_decided_by?: string | null;
};

/** 목록 조건 = 주소 (`status`·`q`·`sort`·`page`·`size`) — 대시보드 딥링크 `?status=` 그대로 호환. 기본 = 승인 대기. */
const STORE_STATUS_VALUES = ADMIN_STORE_STATUS_FILTER.map((f) => f.value).filter((v) => v !== "all");
const LIST_CONFIG = {
  statuses: STORE_STATUS_VALUES,
  sorts: ADMIN_STORES_SORTS,
  defaults: { status: "actionable", sort: "created_desc" },
};

type AdminStoreCounts = Partial<Record<(typeof ADMIN_STORE_STATUS_FILTER)[number]["value"], number>>;

function countValue(counts: AdminStoreCounts, key: string): number {
  const n = Number(counts[key as keyof AdminStoreCounts]);
  return Number.isFinite(n) ? n : 0;
}

function displayAdminPhone(raw: string | null | undefined): string {
  const formatted = formatPhMobileDisplayPlus63(raw ?? "");
  return formatted || (raw ?? "").trim() || "—";
}

function relationName(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): string {
  const rel = Array.isArray(v) ? v[0] : v;
  return String(rel?.name ?? "").trim();
}

function regionText(r: AdminStoreRow): string {
  return [r.district, r.city, r.region].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || "—";
}

const REVIEW_ACTION_LABEL: Record<string, { ko: string; en: string }> = {
  "store.start_review": { ko: "심사 시작", en: "Review started" },
  "store.mark_under_review": { ko: "심사 시작", en: "Review started" },
  "store.approve_store": { ko: "승인", en: "Approved" },
  "store.reject_store": { ko: "반려", en: "Rejected" },
  "store.request_revision": { ko: "보완 요청", en: "Changes requested" },
  "store.reopen_application": { ko: "재심사 열기", en: "Reopened" },
};

/** 「매장 운영」 표(`AdminBusinessTable`)와 같은 열 스타일 */
const TH =
  "whitespace-nowrap px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-sam-muted";
const TD = "align-top whitespace-nowrap px-3 py-3";

export function AdminStoresPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/admin/stores";
  const lq = useAdminListQuery(LIST_CONFIG);
  // IA-07/AD-06: 입점 승인·반려·심사 조치 = 서버 `business` 키 (접근표 /admin/stores action) — 서버 가드가 최종 판정
  const writeAction = useAdminRouteAction("/admin/stores");
  const writeBlocked = !writeAction.allowed;
  /** "" = 전체 (기본값이 있는 화면에서 「전체」 칩) */
  const filter = lq.query.status || "all";
  const sort = lq.query.sort || "created_desc";
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

  /** DEF-15 — 서버 페이지네이션 · 5-E `scope=review` (샘플 제외 + 처리자/처리일). */
  const apiQs = useMemo(() => {
    const parts = [`page=${page}`, `page_size=${pageSize}`, "scope=review", `sort=${encodeURIComponent(sort)}`];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (search) parts.push(`q=${encodeURIComponent(search)}`);
    return `?${parts.join("&")}`;
  }, [filter, search, page, pageSize, sort]);

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
      // 처리 후 현재 필터에서 빠진 신청은 드로어를 닫는다 (오래된 상태로 재처리 방지)
      setSheetStore((prev) => (prev ? nextRows.find((r) => r.id === prev.id) ?? null : null));
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

  /** 행 버튼 승인·반려 — 심사 패널과 같은 확인 팝업(사유) → 같은 PATCH */
  const runRowDecision = async (r: AdminStoreRow, action: "approve_store" | "reject_store") => {
    const confirmed = await confirmAdminStoreAction(action, ko, r.store_name);
    if (!confirmed.ok) return;
    await runAction(r.id, { action, ...(confirmed.reason ? { reason: confirmed.reason } : {}) });
  };

  const returnToHere = `${pathname}${qs}`;

  const sortHeader = (label: string, key: "created" | "status") => {
    const active = key === "created" ? sort === "created_desc" || sort === "created_asc" : sort === "status";
    const next = key === "created" ? (sort === "created_desc" ? "created_asc" : "created_desc") : "status";
    const arrow = !active ? "" : key === "created" ? (sort === "created_asc" ? " ↑" : " ↓") : " ↑";
    return (
      <th
        className={TH}
        aria-sort={!active ? "none" : sort === "created_desc" ? "descending" : "ascending"}
      >
        <AdminActionButton
          variant="quiet"
          size="sm"
          className={`!px-0 uppercase tracking-wide ${active ? "!text-sam-fg" : "!text-sam-muted"}`}
          onClick={() => lq.setSort(next)}
          data-admin-stores-sort={key}
        >
          {label}
          {arrow}
        </AdminActionButton>
      </th>
    );
  };

  const sheetName = (sheetStore?.store_name ?? "").trim() || t("admin_stores_no_store_name");

  return (
    <AdminStoreReviewTheme>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-sam-border pb-4">
          <div className="min-w-0 flex-1">
            <AdminPageHeader titleKey="admin_page_store_review_queue" />
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-admin-stores-status-chips="1">
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

        <AdminResultBanner ko={ko} result={actionResult} onClose={() => setActionResult(null)} />
        {writeBlocked && writeAction.reason ? (
          <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
            {ko ? `심사 조치 비활성: ${writeAction.reason}` : `Review actions disabled: ${writeAction.reason}`}
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4 py-3">
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
              {" · "}
              {ko
                ? "실매장 신청만 표시 (샘플 매장은 「매장 운영」에서 관리)"
                : "Real store applications only (samples live in Store operations)"}
            </p>
          </div>

          {error ? <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} /> : null}
          {loading && rows.length === 0 ? (
            <AdminLoadingState ko={ko} />
          ) : rows.length === 0 ? (
            error ? null : (
              <AdminEmptyState
                ko={ko}
                message={lq.isFiltered ? undefined : t("admin_stores_empty_list")}
                onReset={lq.isFiltered ? lq.reset : undefined}
              />
            )
          ) : (
            <AdminManagementTableViewport className="shadow-sm">
              <table className="w-max min-w-[1280px] border-collapse sam-text-body" data-admin-stores-review-sheet="1">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-surface-muted">
                    {sortHeader(ko ? "신청일" : "Applied", "created")}
                    <th className={TH}>{ko ? "매장명" : "Store"}</th>
                    <th className={TH}>{ko ? "1차 / 2차 업종" : "Category"}</th>
                    <th className={TH}>{ko ? "신청자" : "Applicant"}</th>
                    <th className={TH}>{ko ? "연락처" : "Contact"}</th>
                    <th className={TH}>{ko ? "지역" : "Area"}</th>
                    {sortHeader(ko ? "승인 상태" : "Approval", "status")}
                    <th className={TH}>{ko ? "판매 승인" : "Sales"}</th>
                    <th className={TH}>{ko ? "처리자 / 처리일" : "Handled by"}</th>
                    <th className={TH}>{ko ? "작업" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const storeName = (r.store_name ?? "").trim() || t("admin_stores_no_store_name");
                    const approval = adminStatusLabel("store_approval", r.approval_status, ko);
                    const salesRaw = r.sales_permission?.sales_status ?? null;
                    const sales = salesRaw ? adminStatusLabel("store_sales", salesRaw, ko) : null;
                    const cat = relationName(r.store_categories);
                    const topic = relationName(r.store_topics);
                    const handle = String(r.owner_handle ?? "").trim();
                    const allowed = allowedStoreApprovalActions(r.approval_status);
                    const decided = r.review_decided_action ? REVIEW_ACTION_LABEL[r.review_decided_action] : null;
                    const active = sheetStore?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSheetStore(r)}
                        className={`cursor-pointer border-b border-sam-border-soft hover:bg-sam-surface-muted/80 ${
                          active ? "bg-sam-primary-soft" : ""
                        }`}
                        data-admin-stores-row={r.id}
                      >
                        <td className={`${TD} tabular-nums`}>{formatAdminManilaDate(r.created_at)}</td>
                        <td className={TD}>
                          <div className="flex w-[220px] max-w-[220px] items-center gap-2.5">
                            {r.profile_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={r.profile_image_url}
                                alt=""
                                className="h-11 w-11 shrink-0 rounded-ui-rect border border-sam-border object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface-muted text-[12px] text-sam-muted">
                                —
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold text-sam-fg">{storeName}</div>
                              {r.approval_status === "pending" && (r.revision_note ?? "").trim() ? (
                                <AdminToneBadge tone="warning">{t("admin_r4a_resubmitted_badge")}</AdminToneBadge>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className={TD}>
                          <div className="text-sam-fg">{cat || "—"}</div>
                          <div className="sam-text-helper text-sam-muted">{topic || "—"}</div>
                        </td>
                        <td className={TD}>
                          <div className="max-w-[160px] truncate text-sam-fg">
                            {(r.applicant_nickname ?? "").trim() || "—"}
                          </div>
                          <div className="sam-text-helper text-sam-muted">{handle || "—"}</div>
                        </td>
                        <td className={`${TD} tabular-nums`}>{displayAdminPhone(r.phone)}</td>
                        <td className={TD}>
                          <div className="max-w-[180px] truncate">{regionText(r)}</div>
                        </td>
                        <td className={TD}>
                          <AdminToneBadge tone={approval.tone}>{approval.label}</AdminToneBadge>
                        </td>
                        <td className={TD}>
                          {sales ? (
                            <AdminToneBadge tone={sales.tone}>{sales.label}</AdminToneBadge>
                          ) : (
                            <span className="text-sam-muted">—</span>
                          )}
                        </td>
                        <td className={TD}>
                          {r.review_decided_at ? (
                            <>
                              <div className="text-sam-fg">
                                {r.review_decided_by ?? (ko ? "관리자" : "Admin")}
                                {decided ? <span className="text-sam-muted"> · {ko ? decided.ko : decided.en}</span> : null}
                              </div>
                              <div className="sam-text-helper tabular-nums text-sam-muted">
                                {formatAdminManilaDate(r.review_decided_at)}
                              </div>
                            </>
                          ) : (
                            <span className="text-sam-muted">—</span>
                          )}
                        </td>
                        <td className={TD} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <AdminActionButton variant="ghost" size="sm" onClick={() => setSheetStore(r)}>
                              {ko ? "상세" : "Detail"}
                            </AdminActionButton>
                            {allowed.includes("approve_store") ? (
                              <AdminActionButton
                                variant="secondary"
                                size="sm"
                                disabled={busyId === r.id || writeBlocked}
                                title={writeAction.reason ?? undefined}
                                onClick={() => void runRowDecision(r, "approve_store")}
                                data-admin-stores-row-approve={r.id}
                              >
                                {ko ? "승인" : "Approve"}
                              </AdminActionButton>
                            ) : null}
                            {allowed.includes("reject_store") ? (
                              <AdminActionButton
                                variant="secondary"
                                size="sm"
                                disabled={busyId === r.id || writeBlocked}
                                title={writeAction.reason ?? undefined}
                                onClick={() => void runRowDecision(r, "reject_store")}
                                data-admin-stores-row-reject={r.id}
                              >
                                {ko ? "반려" : "Reject"}
                              </AdminActionButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminManagementTableViewport>
          )}
          {rows.length > 0 ? (
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4"
              data-admin-stores-pagination="1"
            >
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
      <AdminDetailDrawer
        open={sheetStore != null}
        onClose={() => setSheetStore(null)}
        ko={ko}
        pending={sheetStore != null && busyId === sheetStore.id}
        title={sheetName}
        subtitle={ko ? "심사 상세" : "Review detail"}
      >
        {sheetStore ? (
          <AdminStoreReviewTheme>
            <AdminStoreReviewPanel
              store={sheetStore}
              salesStatus={sheetStore.sales_permission?.sales_status ?? null}
              detailHref={withAdminReturnTo(`/admin/business/${encodeURIComponent(sheetStore.id)}`, returnToHere)}
              onRunAction={(action, payload) =>
                runAction(sheetStore.id, {
                  action,
                  ...(payload?.reason ? { reason: payload.reason } : {}),
                  ...(payload?.enabled !== undefined ? { enabled: payload.enabled } : {}),
                  ...(payload?.store_name ? { store_name: payload.store_name } : {}),
                  ...(payload?.expected_core_info_changed_at !== undefined
                    ? { expected_core_info_changed_at: payload.expected_core_info_changed_at }
                    : {}),
                })
              }
              actionBusy={busyId === sheetStore.id || writeBlocked}
              onSetOwnerIdentityEditable={(enabled) => {
                void runAction(sheetStore.id, { action: "set_owner_identity_editable", enabled });
              }}
              identityActionBusy={busyId === sheetStore.id || writeBlocked}
            />
          </AdminStoreReviewTheme>
        ) : null}
      </AdminDetailDrawer>
    </AdminStoreReviewTheme>
  );
}
