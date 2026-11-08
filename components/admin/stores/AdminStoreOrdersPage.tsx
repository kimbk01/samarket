"use client";

/**
 * /admin/store-orders — 관리자 매장 주문 조회·감독 화면.
 * Read SSOT: lib/admin/store-orders/admin-store-orders-contract.ts · GET /api/admin/store-orders/list
 * (rows + total + tab counts = one RPC). The store owner runs the order; this screen observes.
 *
 * CTA contract:
 * - 조회: applies the search form → page 1, new snapshot (server re-query).
 * - 새로고침: same filters and page, new snapshot (server re-query, no client cache).
 * - Page moves keep `as_of` (orders created after it never shift pages). Rows whose
 *   status/payment changes between page loads can still move in or out of a status-filtered
 *   list — see docs/admin-store-orders-read-ssot.md §3-1 for the exact guarantee.
 * - A failed request keeps the previous result and shows the error (never "0 orders").
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  chipClass,
  COMMISSION_PRESS,
  CommissionPeriodFilter,
  CommissionStateChip,
  ROW_ACTION_BTN,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  ADMIN_STORE_ORDERS_FULFILLMENT_LABEL,
  ADMIN_STORE_ORDERS_FULFILLMENT_TYPES,
  ADMIN_STORE_ORDERS_INTEGRITY_LABEL,
  ADMIN_STORE_ORDERS_PAYMENT_LABEL,
  ADMIN_STORE_ORDERS_PAYMENT_STATUSES,
  ADMIN_STORE_ORDERS_TAB_LABEL,
  ADMIN_STORE_ORDERS_TABS,
  adminStoreOrderStatusChipClass,
  adminStoreOrdersQueryToParams,
  parseAdminStoreOrdersQuery,
  type AdminStoreOrdersFulfillment,
  type AdminStoreOrdersPageResult,
  type AdminStoreOrdersPaymentStatus,
  type AdminStoreOrdersQuery,
  type AdminStoreOrdersTab,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import { STORE_ORDER_STATUS_LIST, type StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatManilaDateTime, type StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import { formatMoneyPhp } from "@/lib/utils/format";
import { translateBy } from "@/lib/i18n/translate-by";

type SearchForm = {
  storeName: string;
  orderNo: string;
  buyer: string;
  orderStatus: StoreOrderStatus | "";
  fulfillment: AdminStoreOrdersFulfillment | "";
  paymentStatus: AdminStoreOrdersPaymentStatus | "";
  period: StoreCommissionPeriod;
  fromDay: string;
  toDay: string;
};

type LoadMode = "query" | "refresh" | "page";

function formFromQuery(q: AdminStoreOrdersQuery): SearchForm {
  return {
    storeName: q.storeName ?? "",
    orderNo: q.orderNo ?? "",
    buyer: q.buyer ?? "",
    orderStatus: q.orderStatus ?? "",
    fulfillment: q.fulfillment ?? "",
    paymentStatus: q.paymentStatus ?? "",
    period: q.period,
    fromDay: q.fromDay ?? "",
    toDay: q.toDay ?? "",
  };
}

function applyForm(q: AdminStoreOrdersQuery, f: SearchForm): AdminStoreOrdersQuery {
  return {
    ...q,
    storeName: f.storeName.trim() || null,
    orderNo: f.orderNo.trim() || null,
    buyer: f.buyer.trim() || null,
    orderStatus: f.orderStatus || null,
    fulfillment: f.fulfillment || null,
    paymentStatus: f.paymentStatus || null,
    period: f.period,
    fromDay: f.period === "custom" ? f.fromDay || null : null,
    toDay: f.period === "custom" ? f.toDay || null : null,
    page: 1,
    asOf: null,
  };
}

/** Stored times are UTC; admin screens show Asia/Manila (same as settlement). */
function manilaSeconds(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return `${new Date(ms + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ")} PHT`;
}

const INPUT =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-2 sam-text-helper text-sam-fg placeholder:text-sam-meta focus:border-signature focus:outline-none";
const PRIMARY_BTN = `inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-ui-rect bg-signature px-4 py-2 sam-text-helper font-semibold text-white hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${COMMISSION_PRESS}`;
const SECONDARY_BTN = `inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${COMMISSION_PRESS}`;
const PAGER_BTN = `inline-flex min-h-9 min-w-9 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted disabled:cursor-not-allowed disabled:opacity-40 ${COMMISSION_PRESS}`;

function Pager({
  page,
  pageSize,
  total,
  busy,
  onGo,
  lang,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onGo: (page: number) => void;
  lang: CommissionLang;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p: number) => {
    const next = Math.min(pages, Math.max(1, Math.floor(p) || 1));
    if (next !== page) onGo(next);
    else setJump(String(page));
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 sam-text-helper" data-admin-orders-pager="1">
      <span className="text-sam-muted tabular-nums">
        {translateBy(lang, "admin_v1_v2_of_v3", { v3: total.toLocaleString(), v1: from.toLocaleString(), v2: to.toLocaleString() }, "en")}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(1)} aria-label="first page">
          «
        </button>
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(page - 1)}>
          {translateBy(lang, "admin_prev", undefined, "en")}
        </button>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(Number(jump));
          }}
        >
          <input
            className="w-14 rounded-ui-rect border border-sam-border bg-sam-surface px-1.5 py-1.5 text-center tabular-nums text-sam-fg"
            inputMode="numeric"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
            disabled={busy || pages <= 1}
            aria-label={translateBy(lang, "admin_page_number", undefined, "en")}
          />
          <span className="tabular-nums text-sam-muted">/ {pages.toLocaleString()}</span>
        </form>
        <button type="button" className={PAGER_BTN} disabled={busy || page >= pages} onClick={() => go(page + 1)}>
          {translateBy(lang, "admin_next", undefined, "en")}
        </button>
        <button type="button" className={PAGER_BTN} disabled={busy || page >= pages} onClick={() => go(pages)} aria-label="last page">
          »
        </button>
      </div>
    </div>
  );
}

export function AdminStoreOrdersPage() {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const ko = lang === "ko";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [applied, setApplied] = useState<AdminStoreOrdersQuery>(() =>
    parseAdminStoreOrdersQuery(new URLSearchParams(searchKey))
  );
  const [form, setForm] = useState<SearchForm>(() => formFromQuery(applied));
  const [result, setResult] = useState<AdminStoreOrdersPageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LoadMode | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastUrlRef = useRef<string>(searchKey);

  const statusLabel = useCallback(
    (s: string) => {
      const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
      return key ? t(key) : s;
    },
    [t]
  );

  const errorText = useCallback(
    (code: string) => {
      if (code === "forbidden") return t("admin_audit_err_no_permission");
      if (code === "network_error") return t("common_network_error");
      if (code === "rpc_missing")
        return t("admin_stores_order_list_function_is_not_deployed");
      return t("admin_stores_failed_to_load", { code });
    },
    [t]
  );

  /** Every read goes to the server (`no-store`); the previous result stays on failure. */
  const load = useCallback(
    async (q: AdminStoreOrdersQuery, mode: LoadMode) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(mode);
      setError(null);

      const urlParams = adminStoreOrdersQueryToParams(q);
      if (q.page > 1) urlParams.set("page", String(q.page));
      const urlQs = urlParams.toString();
      if (urlQs !== lastUrlRef.current) {
        lastUrlRef.current = urlQs;
        router.replace(urlQs ? `${pathname}?${urlQs}` : pathname, { scroll: false });
      }

      try {
        const qs = adminStoreOrdersQueryToParams(q, { includePaging: true }).toString();
        const res = await fetch(`/api/admin/store-orders/list${qs ? `?${qs}` : ""}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<AdminStoreOrdersPageResult>;
        if (ac.signal.aborted) return;
        if (res.status === 401 || res.status === 403) throw new Error("forbidden");
        if (!res.ok || json.ok !== true) throw new Error(typeof json.error === "string" ? json.error : `http_${res.status}`);
        const next = json as AdminStoreOrdersPageResult;
        // A page past the end (rows removed since the last look) → clamp to the last page.
        const pages = Math.max(1, Math.ceil(next.total / next.pageSize));
        if (next.rows.length === 0 && next.total > 0 && q.page > pages) {
          const clamped = { ...q, page: pages, asOf: next.asOf };
          setApplied(clamped);
          void load(clamped, mode);
          return;
        }
        setApplied({ ...q, asOf: next.asOf });
        setResult(next);
      } catch (err) {
        if (ac.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "network_error";
        setError(msg === "Failed to fetch" ? "network_error" : msg);
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          setBusy(null);
        }
      }
    },
    [pathname, router]
  );

  // First load + external URL changes (deep links into this screen while it is open).
  useEffect(() => {
    if (result !== null && searchKey === lastUrlRef.current) return;
    lastUrlRef.current = searchKey;
    const q = parseAdminStoreOrdersQuery(new URLSearchParams(searchKey));
    setApplied(q);
    setForm(formFromQuery(q));
    void load(q, "query");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the URL changes
  }, [searchKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const onSearch = (e?: FormEvent) => {
    e?.preventDefault();
    void load(applyForm(applied, form), "query");
  };
  const onRefresh = () => {
    void load({ ...applied, asOf: null }, "refresh");
  };
  const onTab = (tab: AdminStoreOrdersTab) => {
    void load({ ...applied, tab, page: 1, asOf: null }, "query");
  };
  const onPage = (page: number) => void load({ ...applied, page }, "page");
  const onReset = () => {
    const cleared = parseAdminStoreOrdersQuery(new URLSearchParams());
    setForm(formFromQuery(cleared));
    void load(cleared, "query");
  };
  const clearDeepLink = (key: "storeId" | "orderId" | "buyerUserId" | "adminQueue") => {
    void load({ ...applied, [key]: key === "adminQueue" ? false : null, page: 1, asOf: null }, "query");
  };

  const rows = result?.rows ?? [];
  const deepLinks = useMemo(() => {
    const out: { key: "storeId" | "orderId" | "buyerUserId" | "adminQueue"; label: string }[] = [];
    if (applied.storeId) {
      const name = rows.find((r) => r.store_id === applied.storeId)?.store_name;
      out.push({ key: "storeId", label: t("admin_stores_filter_store_chip", { name: name || t("admin_stores_filter_selected_store") }) });
    }
    if (applied.orderId) {
      const no = rows.find((r) => r.id === applied.orderId)?.order_no;
      out.push({ key: "orderId", label: t("admin_stores_filter_order_chip", { no: no || t("admin_stores_filter_selected_order") }) });
    }
    if (applied.buyerUserId) {
      const b = rows.find((r) => r.buyer_user_id === applied.buyerUserId)?.buyer_label;
      out.push({ key: "buyerUserId", label: t("admin_stores_filter_buyer_chip", { name: b || t("admin_stores_filter_selected_buyer") }) });
    }
    if (applied.adminQueue) out.push({ key: "adminQueue", label: t("admin_stores_admin_action_queue") });
    return out;
  }, [applied, rows, t]);

  const exportHref = useMemo(() => {
    const p = adminStoreOrdersQueryToParams(applied);
    p.set("view", "list");
    if (applied.asOf) p.set("as_of", applied.asOf);
    return `/api/admin/store-orders/export?${p.toString()}`;
  }, [applied]);

  const loadingAny = busy !== null;

  return (
    <div className="space-y-4" data-admin-store-orders="1">
      <AdminPageHeader titleKey="admin_page_store_orders" />

      {/* 상단 현황 = 상태 탭 (서버 집계, 목록과 같은 조건) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label={t("admin_stores_order_status")}>
        {ADMIN_STORE_ORDERS_TABS.map((tab) => {
          const active = applied.tab === tab;
          const count = result?.tabCounts[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={loadingAny && active}
              onClick={() => onTab(tab)}
              data-tab={tab}
              className={`flex flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left ${COMMISSION_PRESS} ${
                active
                  ? "border-signature bg-signature/5"
                  : "border-sam-border bg-sam-surface hover:bg-sam-surface-muted active:bg-sam-surface-muted"
              }`}
            >
              <span className={`sam-text-xxs ${active ? "font-semibold text-signature" : "text-sam-muted"}`}>
                {ADMIN_STORE_ORDERS_TAB_LABEL[tab][lang]}
              </span>
              <span className="text-lg font-semibold tabular-nums text-sam-fg">
                {typeof count === "number" ? count.toLocaleString() : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* 검색 */}
      <form
        onSubmit={onSearch}
        className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4"
        aria-label={t("admin_stores_search_orders")}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_store")}</span>
            <input className={INPUT} value={form.storeName} onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} placeholder={t("admin_stores_store_name")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_order_no")}</span>
            <input className={INPUT} value={form.orderNo} onChange={(e) => setForm((f) => ({ ...f, orderNo: e.target.value }))} placeholder="SO…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_buyer")}</span>
            <input className={INPUT} value={form.buyer} onChange={(e) => setForm((f) => ({ ...f, buyer: e.target.value }))} placeholder={t("admin_stores_nickname")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_orders_filter_status")}</span>
            <select className={INPUT} value={form.orderStatus} onChange={(e) => setForm((f) => ({ ...f, orderStatus: e.target.value as SearchForm["orderStatus"] }))}>
              <option value="">{t("common_all")}</option>
              {STORE_ORDER_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_fulfillment")}</span>
            <select className={INPUT} value={form.fulfillment} onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value as SearchForm["fulfillment"] }))}>
              <option value="">{t("common_all")}</option>
              {ADMIN_STORE_ORDERS_FULFILLMENT_TYPES.map((v) => (
                <option key={v} value={v}>
                  {ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[v][lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_payment")}</span>
            <select className={INPUT} value={form.paymentStatus} onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value as SearchForm["paymentStatus"] }))}>
              <option value="">{t("common_all")}</option>
              {ADMIN_STORE_ORDERS_PAYMENT_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {ADMIN_STORE_ORDERS_PAYMENT_LABEL[v][lang]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CommissionPeriodFilter
            period={form.period}
            fromDay={form.fromDay}
            toDay={form.toDay}
            lang={lang}
            onChange={(next) => setForm((f) => ({ ...f, ...next }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SECONDARY_BTN} onClick={onReset} disabled={loadingAny} data-cta="reset">
              {t("admin_stores_reset")}
            </button>
            <button type="submit" className={PRIMARY_BTN} disabled={loadingAny} data-cta="search">
              {busy === "query" ? t("admin_stores_searching") : t("admin_stores_search")}
            </button>
          </div>
        </div>
        {deepLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {deepLinks.map((d) => (
              <button key={d.key} type="button" className={chipClass(true)} onClick={() => clearDeepLink(d.key)} disabled={loadingAny} aria-label={t("admin_stores_clear_2", { label: d.label })}>
                {d.label} ✕
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {/* 결과 상태 바: 조회 시각 · 새로고침 · CSV */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
        <span className="sam-text-helper text-sam-muted" data-fetched-at={result?.fetchedAt ?? ""}>
          {result
            ? t("admin_stores_loaded", { fetchedAt: manilaSeconds(result.fetchedAt) })
            : t("admin_stores_not_loaded_yet")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <a href={exportHref} className={ROW_ACTION_BTN} download data-cta="csv">
            {t("admin_stores_orders_csv_export")}
          </a>
          <button type="button" className={ROW_ACTION_BTN} onClick={onRefresh} disabled={loadingAny || !result} data-cta="refresh">
            {busy === "refresh" ? t("admin_stores_refreshing") : t("admin_stores_fee_refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger" data-state="error">
          {errorText(error)}
          {result ? t("admin_stores_showing_previous_result") : ""}
        </p>
      ) : null}

      {result ? <Pager page={applied.page} pageSize={result.pageSize} total={result.total} busy={loadingAny} onGo={onPage} lang={lang} /> : null}

      {!result && busy ? (
        <p className="py-8 text-center sam-text-body text-sam-muted" data-state="loading">{t("common_loading")}</p>
      ) : result && rows.length === 0 ? (
        <p className="py-8 text-center sam-text-body text-sam-muted" data-state="empty">
          {t("admin_stores_no_orders_match_these_filters")}
        </p>
      ) : result ? (
        <div className={`overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface ${busy ? "opacity-70" : ""}`} aria-busy={busy !== null}>
          <table className="min-w-[1180px] w-full text-left sam-text-helper">
            <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin_stores_order_no")}</th>
                <th className="px-3 py-2 font-medium">{t("common_store")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_items")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_buyer")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin_stores_amount")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_type")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_payment")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_commission")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_ordered")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_completed")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_payment_th_detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const detailHref = `/admin/stores/orders/${encodeURIComponent(r.id)}`;
                const fulfill = ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[r.fulfillment_type as AdminStoreOrdersFulfillment]?.[lang] ?? r.fulfillment_type;
                const pay = ADMIN_STORE_ORDERS_PAYMENT_LABEL[r.payment_status as AdminStoreOrdersPaymentStatus]?.[lang] ?? r.payment_status;
                return (
                  <tr key={r.id} className="border-b border-sam-border-soft align-top last:border-b-0 hover:bg-sam-app" data-order-row={r.order_no}>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link href={detailHref} className="font-mono font-medium text-sam-fg underline-offset-2 hover:underline">
                        {r.order_no}
                      </Link>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-sam-fg" title={r.store_name}>
                      {r.store_name || "—"}
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 text-sam-fg">
                      <span className="line-clamp-2">
                        {r.first_title
                          ? r.line_count > 1
                            ? t("admin_stores_order_first_item_more", { first_title: r.first_title, line_count: r.line_count - 1 })
                            : r.first_title
                          : "—"}
                      </span>
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-fg" title={r.buyer_label}>
                      {r.buyer_label || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      <div className="font-medium text-sam-fg">{formatMoneyPhp(r.total_amount)}</div>
                      {r.payment_amount !== r.total_amount ? (
                        <div className="sam-text-xxs text-sam-muted">
                          {t("admin_stores_paid")}
                          {formatMoneyPhp(r.payment_amount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sam-fg">{fulfill}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${adminStoreOrderStatusChipClass(r.order_status)}`}>
                          {statusLabel(r.order_status)}
                        </span>
                        {r.sla_warning_level ? (
                          <span className="sam-text-xxs text-sam-warning">{t("admin_stores_delayed")}</span>
                        ) : null}
                        {r.order_status === "cancel_requested" || r.order_status === "refund_requested" ? (
                          <Link href={detailHref} className={ROW_ACTION_BTN} data-testid="admin-order-decision-link">
                            {t("admin_stores_decide_in_detail")}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span className="whitespace-nowrap text-sam-fg">{pay}</span>
                        {r.integrity_flags.map((f) => (
                          <span key={f} className="whitespace-nowrap rounded-full bg-sam-danger-soft px-2 py-0.5 sam-text-xxs font-semibold text-sam-danger" data-integrity-flag={f}>
                            {ADMIN_STORE_ORDERS_INTEGRITY_LABEL[f][lang]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.commission_state ? (
                        <CommissionStateChip state={r.commission_state} lang={lang} />
                      ) : (
                        <span className="sam-text-xxs text-sam-muted">{t("admin_stores_not_charged")}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-sam-muted">{formatManilaDateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-sam-muted">{r.completed_at ? formatManilaDateTime(r.completed_at) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Link href={detailHref} className={ROW_ACTION_BTN}>
                        {t("admin_stores_view")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {result && rows.length > 0 ? (
        <Pager page={applied.page} pageSize={result.pageSize} total={result.total} busy={loadingAny} onGo={onPage} lang={lang} />
      ) : null}
      <p className="sam-text-xxs text-sam-muted">{t("admin_stores_times_philippine_time_utc_8")}</p>
    </div>
  );
}
