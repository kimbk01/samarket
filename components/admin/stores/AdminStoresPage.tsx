"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { AdminStoreListBulkBar } from "@/components/admin/stores/AdminStoreListBulkBar";
import { AdminSampleStoreDeleteDrawer } from "@/components/admin/stores/AdminSampleStoreDeleteDrawer";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import {
  EMPTY_ADMIN_STORE_SELECTION,
  isPageFullySelected,
  onFilterChangeAdminStoreSelection,
  removeFromAdminStoreSelection,
  selectAllResultsAdminStoreSelection,
  toggleAdminStoreSelection,
  togglePageAdminStoreSelection,
  type AdminStoreSelection,
} from "@/lib/admin-business/admin-store-selection";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & {
  sales_permission: SalesPerm;
  /** 3-C L-1 — real / sample / legacy_test */
  store_kind?: string | null;
  menu_count?: number | null;
  option_count?: number | null;
  linked_ad_count?: number;
  linked_ad_live_count?: number;
};

/** 목록 조건 = 주소 (`status`·`q`·`page`·`size` + 3-C `kind`·`category_id`·`topic_id`) — 대시보드 딥링크 `?status=` 그대로 호환. */
const STORE_STATUS_VALUES = ADMIN_STORE_STATUS_FILTER.map((f) => f.value).filter((v) => v !== "all");
const STORE_LIST_EXTRAS = ["kind", "category_id", "topic_id"] as const;
const LIST_CONFIG = { statuses: STORE_STATUS_VALUES, extras: STORE_LIST_EXTRAS };

/** 3-C L-1·L-2 — 매장 유형 필터·배지 */
const STORE_KIND_FILTER: { value: string; ko: string; en: string }[] = [
  { value: "", ko: "전체 유형", en: "All types" },
  { value: "real", ko: "실제 매장", en: "Real" },
  { value: "sample", ko: "샘플만 보기", en: "Samples only" },
  { value: "legacy_test", ko: "테스트 매장", en: "Test" },
];

function storeKindBadge(kind: string | null | undefined, ko: boolean): { tone: "neutral" | "warning" | "danger"; label: string } | null {
  if (kind === "sample") return { tone: "warning", label: ko ? "샘플" : "Sample" };
  if (kind === "legacy_test") return { tone: "danger", label: ko ? "테스트" : "Test" };
  if (kind === "real") return { tone: "neutral", label: ko ? "실제" : "Real" };
  return null;
}

type TaxonomyOption = { id: string; name: string; store_category_id?: string | null };

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
  const kindFilter = lq.query.extras.kind ?? "";
  const categoryFilter = lq.query.extras.category_id ?? "";
  const topicFilter = lq.query.extras.topic_id ?? "";
  const [selection, setSelection] = useState<AdminStoreSelection>(EMPTY_ADMIN_STORE_SELECTION);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [categories, setCategories] = useState<TaxonomyOption[]>([]);
  const [topics, setTopics] = useState<TaxonomyOption[]>([]);
  const filter = lq.query.status || "all";
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
    if (categoryFilter) parts.push(`category_id=${encodeURIComponent(categoryFilter)}`);
    if (topicFilter) parts.push(`topic_id=${encodeURIComponent(topicFilter)}`);
    return `?${parts.join("&")}`;
  }, [filter, search, page, pageSize, kindFilter, categoryFilter, topicFilter]);

  /** 3-C L-10 — 필터 키 (페이지 제외). 필터가 바뀌면 「전체 결과 선택」 표시만 해제, 선택 id 는 유지 */
  const filterKey = `${filter}|${search}|${kindFilter}|${categoryFilter}|${topicFilter}`;
  useEffect(() => {
    setSelection((prev) => onFilterChangeAdminStoreSelection(prev, filterKey));
  }, [filterKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/stores/taxonomy", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          categories?: TaxonomyOption[];
          topics?: TaxonomyOption[];
        } | null;
        if (cancelled || !json?.ok) return;
        setCategories(Array.isArray(json.categories) ? json.categories : []);
        setTopics(Array.isArray(json.topics) ? json.topics : []);
      } catch {
        /* 필터 옵션만 비움 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const pageIds = rows.map((r) => r.id);
  const rowsById = useMemo(
    () => new Map(rows.map((r) => [r.id, { id: r.id, store_name: r.store_name ?? null }])),
    [rows]
  );

  /** 3-C L-10 — 서버가 같은 필터로 id 목록 확정 (페이지 무관) */
  const selectAllResults = async () => {
    if (selectAllBusy) return;
    setSelectAllBusy(true);
    try {
      const qsAll = apiQs.replace(/(^\?|&)page=\d+/, "$1page=1");
      const res = await fetch(`/api/admin/stores${qsAll}&select_all=1`, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        ids?: string[];
        total?: number;
        truncated?: boolean;
        max?: number;
      } | null;
      if (!json?.ok || !Array.isArray(json.ids)) {
        setActionResult({ ok: false, code: json?.error ?? "load_failed" });
        return;
      }
      setSelection(
        selectAllResultsAdminStoreSelection({ ids: json.ids, total: Number(json.total) || json.ids.length, filterKey })
      );
      if (json.truncated) {
        setActionResult({
          ok: true,
          message: ko
            ? `결과가 ${formatAdminNumber(json.total)}곳이라 앞의 ${formatAdminNumber(json.max)}곳만 선택했습니다.`
            : `Only the first ${json.max} of ${json.total} were selected.`,
        });
      }
    } catch {
      setActionResult({ ok: false, code: "network_error" });
    } finally {
      setSelectAllBusy(false);
    }
  };

  const toggleVisibility = async (r: AdminStoreRow) => {
    const enable = !r.is_visible;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(enable ? "exposeStart" : "exposeStop"),
      ko,
      title: `${(r.store_name ?? "").trim() || "—"} · ${enable ? adminCta("exposeStart", ko) : adminCta("exposeStop", ko)}`,
      confirmLabel: enable ? adminCta("exposeStart", ko) : adminCta("exposeStop", ko),
    });
    if (!confirmed.ok) return;
    await runAction(r.id, {
      action: "set_store_visible",
      enabled: enable,
      ...(confirmed.reason ? { reason: confirmed.reason } : {}),
    });
  };

  const selectionScopeLabel =
    selection.scope === "all_results"
      ? ko
        ? `전체 결과 선택 (조건 일치 ${formatAdminNumber(selection.allResultsTotal)}곳)`
        : `All results (${selection.allResultsTotal})`
      : ko
        ? "직접 선택 · 페이지를 옮겨도 유지"
        : "Manual selection · kept across pages";
  const topicOptions = categoryFilter ? topics.filter((tp) => tp.store_category_id === categoryFilter) : topics;

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

        <div className="flex flex-wrap items-center gap-1.5" data-admin-store-kind-filter="1">
          {STORE_KIND_FILTER.map((f) => (
            <AdminChipButton
              key={f.value || "all"}
              selected={kindFilter === f.value}
              className="shrink-0"
              onClick={() => lq.setExtra("kind", f.value)}
            >
              {ko ? f.ko : f.en}
            </AdminChipButton>
          ))}
          <select
            value={categoryFilter}
            onChange={(e) => lq.patch({ extras: { category_id: e.target.value, topic_id: "" } })}
            aria-label={ko ? "1차 업종" : "Primary category"}
            className="h-8 max-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
          >
            <option value="">{ko ? "1차 업종 전체" : "All primary"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={topicFilter}
            onChange={(e) => lq.setExtra("topic_id", e.target.value)}
            aria-label={ko ? "2차 업종" : "Secondary category"}
            className="h-8 max-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
          >
            <option value="">{ko ? "2차 업종 전체" : "All secondary"}</option>
            {topicOptions.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
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

          <AdminStoreListBulkBar
            ko={ko}
            selectedIds={selection.ids}
            scopeLabel={selectionScopeLabel}
            rowsById={rowsById}
            onClear={() => setSelection(EMPTY_ADMIN_STORE_SELECTION)}
            onCompleted={() => {
              void load();
            }}
            onOpenDelete={() => setDeleteIds([...selection.ids])}
          />
          {rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-sam-border px-4 py-2" data-admin-store-select-controls="1">
              <label className="inline-flex items-center gap-2 text-[13px] text-sam-fg">
                <input
                  type="checkbox"
                  checked={isPageFullySelected(selection, pageIds)}
                  onChange={() => setSelection((prev) => togglePageAdminStoreSelection(prev, pageIds))}
                  data-admin-store-select-page="1"
                />
                {ko ? `현재 페이지 선택 (${formatAdminNumber(pageIds.length)}곳)` : `Select this page (${pageIds.length})`}
              </label>
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={selectAllBusy || loading}
                onClick={() => void selectAllResults()}
                data-admin-store-select-all-results="1"
              >
                {ko ? `전체 결과 선택 (${formatAdminNumber(total)}곳)` : `Select all results (${total})`}
              </AdminActionButton>
            </div>
          ) : null}
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
                  const kindBadge = storeKindBadge(r.store_kind, ko);

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
                              <input
                                type="checkbox"
                                checked={selection.ids.includes(r.id)}
                                onChange={() => setSelection((prev) => toggleAdminStoreSelection(prev, r.id))}
                                aria-label={ko ? `${storeName} 선택` : `Select ${storeName}`}
                                data-admin-store-select-row={r.id}
                              />
                              {r.profile_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={r.profile_image_url}
                                  alt=""
                                  className="h-8 w-8 rounded-ui-rect border border-sam-border object-cover"
                                />
                              ) : null}
                              <h2 className="text-[14px] font-bold leading-5 text-sam-fg">{storeName}</h2>
                              {kindBadge ? <AdminToneBadge tone={kindBadge.tone}>{kindBadge.label}</AdminToneBadge> : null}
                              <AdminToneBadge tone={r.is_visible ? "success" : "neutral"}>
                                {r.is_visible ? (ko ? "노출 중" : "Visible") : ko ? "숨김" : "Hidden"}
                              </AdminToneBadge>
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
                                label={ko ? "메뉴·옵션" : "Menus · options"}
                                value={
                                  r.menu_count == null
                                    ? "—"
                                    : ko
                                      ? `메뉴 ${formatAdminNumber(r.menu_count)} · 옵션 ${formatAdminNumber(r.option_count ?? 0)}`
                                      : `${r.menu_count} menus · ${r.option_count ?? 0} options`
                                }
                              />
                              <ReviewRow
                                label={ko ? "연결 광고" : "Linked ads"}
                                value={
                                  ko
                                    ? `${formatAdminNumber(r.linked_ad_count ?? 0)}건 (진행 중 ${formatAdminNumber(r.linked_ad_live_count ?? 0)})`
                                    : `${r.linked_ad_count ?? 0} (live ${r.linked_ad_live_count ?? 0})`
                                }
                              />
                              <ReviewRow
                                label={ko ? "등록·수정일" : "Created · updated"}
                                value={`${formatAdminManilaDate(r.created_at)} · ${r.updated_at ? formatAdminManilaDate(r.updated_at) : "—"}`}
                              />
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

                          <div className="flex flex-col items-end gap-1.5">
                            <AdminActionButton
                              variant="ghost"
                              size="sm"
                              onClick={() => setSheetStore((prev) => (prev?.id === r.id ? null : r))}
                              aria-expanded={active}
                            >
                              {active ? t("admin_stores_close_review") : t("admin_stores_open_review")}
                            </AdminActionButton>
                            {r.approval_status === "approved" ? (
                              <AdminActionButton
                                variant="secondary"
                                size="sm"
                                disabled={busyId === r.id}
                                onClick={() => void toggleVisibility(r)}
                                data-admin-store-row-visibility={r.id}
                              >
                                {r.is_visible ? adminCta("exposeStop", ko) : adminCta("exposeStart", ko)}
                              </AdminActionButton>
                            ) : null}
                            {r.store_kind === "sample" ? (
                              <AdminActionButton
                                variant="danger"
                                size="sm"
                                onClick={() => setDeleteIds([r.id])}
                                data-admin-store-row-delete={r.id}
                              >
                                {adminCta("delete", ko)}
                              </AdminActionButton>
                            ) : null}
                          </div>
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
      <AdminSampleStoreDeleteDrawer
        open={deleteIds != null}
        storeIds={deleteIds ?? []}
        ko={ko}
        onClose={() => setDeleteIds(null)}
        onDone={(removedIds) => {
          setSelection((prev) => removeFromAdminStoreSelection(prev, removedIds));
          void load();
        }}
      />
    </AdminStoreReviewTheme>
  );
}
