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
import { dibayConfirm } from "@/components/ui/dibay-overlay";
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
import { invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
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
  type AdminStoreOrderListRow,
  type AdminStoreOrdersFulfillment,
  type AdminStoreOrdersPageResult,
  type AdminStoreOrdersPaymentStatus,
  type AdminStoreOrdersQuery,
  type AdminStoreOrdersTab,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { STORE_ORDER_STATUS_LIST, type StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatManilaDateTime, type StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import { formatMoneyPhp } from "@/lib/utils/format";

const ORDER_STATUS_LABEL_KEYS: Record<StoreOrderStatus, MessageKey> = {
  pending: "admin_stores_orders_status_pending",
  accepted: "admin_stores_orders_status_accepted",
  preparing: "admin_stores_orders_status_preparing",
  ready_for_pickup: "admin_stores_orders_status_ready_for_pickup",
  delivering: "admin_stores_orders_status_delivering",
  arrived: "admin_stores_orders_status_arrived",
  completed: "admin_stores_orders_status_completed",
  cancel_requested: "admin_stores_orders_status_cancel_requested",
  cancelled: "admin_stores_orders_status_cancelled",
  refund_requested: "admin_stores_orders_status_refund_requested",
  refunded: "admin_stores_orders_status_refunded",
};

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
        {lang === "ko"
          ? `전체 ${total.toLocaleString()}건 · ${from.toLocaleString()}–${to.toLocaleString()}`
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(1)} aria-label="first page">
          «
        </button>
        <button type="button" className={PAGER_BTN} disabled={busy || page <= 1} onClick={() => go(page - 1)}>
          {lang === "ko" ? "이전" : "Prev"}
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
            aria-label={lang === "ko" ? "페이지 번호" : "Page number"}
          />
          <span className="tabular-nums text-sam-muted">/ {pages.toLocaleString()}</span>
        </form>
        <button type="button" className={PAGER_BTN} disabled={busy || page >= pages} onClick={() => go(page + 1)}>
          {lang === "ko" ? "다음" : "Next"}
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
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastUrlRef = useRef<string>(searchKey);

  const statusLabel = useCallback(
    (s: string) => {
      const key = ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
      return key ? t(key) : s;
    },
    [t]
  );

  const errorText = useCallback(
    (code: string) => {
      if (code === "forbidden") return t("admin_audit_err_no_permission");
      if (code === "network_error") return t("common_network_error");
      if (code === "rpc_missing")
        return ko
          ? "주문 조회 함수가 아직 DB에 적용되지 않았습니다. 관리자에게 마이그레이션 적용을 요청하세요."
          : "The order list function is not deployed to the database yet.";
      return ko ? `조회에 실패했습니다. (${code})` : `Failed to load. (${code})`;
    },
    [ko, t]
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
    setNotice(null);
    void load(applyForm(applied, form), "query");
  };
  const onRefresh = () => {
    setNotice(null);
    void load({ ...applied, asOf: null }, "refresh");
  };
  const onTab = (tab: AdminStoreOrdersTab) => {
    setNotice(null);
    void load({ ...applied, tab, page: 1, asOf: null }, "query");
  };
  const onPage = (page: number) => void load({ ...applied, page }, "page");
  const onReset = () => {
    const cleared = parseAdminStoreOrdersQuery(new URLSearchParams());
    setForm(formFromQuery(cleared));
    setNotice(null);
    void load(cleared, "query");
  };
  const clearDeepLink = (key: "storeId" | "orderId" | "buyerUserId" | "adminQueue") => {
    void load({ ...applied, [key]: key === "adminQueue" ? false : null, page: 1, asOf: null }, "query");
  };

  /** Existing admin decision paths (moved to order detail in the next step; kept until then). */
  const decide = useCallback(
    async (row: AdminStoreOrderListRow, kind: "cancel_approve" | "cancel_reject" | "refund_approve" | "refund_reject") => {
      const title =
        kind === "cancel_approve"
          ? t("admin_store_orders_confirm_cancel_request_approve")
          : kind === "cancel_reject"
            ? t("admin_store_orders_confirm_cancel_request_reject")
            : kind === "refund_approve"
              ? t("admin_stores_orders_confirm_refund")
              : t("admin_stores_orders_confirm_reject_refund");
      const destructive = kind === "cancel_approve" || kind === "refund_approve";
      if (!(await dibayConfirm({ title, confirmTone: destructive ? "destructive" : undefined }))) return;
      setDecisionBusyId(row.id);
      setNotice(null);
      try {
        const id = encodeURIComponent(row.id);
        const res =
          kind === "cancel_approve" || kind === "cancel_reject"
            ? await fetch(`/api/admin/store-orders/${id}/cancel-request`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: kind === "cancel_approve" ? "approve" : "reject" }),
              })
            : kind === "refund_approve"
              ? await fetch(`/api/admin/store-orders/${id}/approve-refund`, { method: "POST", credentials: "include" })
              : await fetch(`/api/admin/store-orders/${id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    reject_refund: true,
                    restore_to_status: "completed",
                    reject_reason: t("admin_stores_orders_reject_refund_default_reason"),
                  }),
                });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok !== true) {
          setNotice(errorText(json.error ?? `http_${res.status}`));
          return;
        }
        invalidateAdminFetchCache("admin:store-orders:");
        emitAdminQueueChanged("orders_attention");
        setNotice(ko ? `${row.order_no} 처리 완료` : `${row.order_no} updated`);
        await load({ ...applied, asOf: null }, "refresh");
      } catch {
        setNotice(t("common_network_error"));
      } finally {
        setDecisionBusyId(null);
      }
    },
    [applied, errorText, ko, load, t]
  );

  const rows = result?.rows ?? [];
  const deepLinks = useMemo(() => {
    const out: { key: "storeId" | "orderId" | "buyerUserId" | "adminQueue"; label: string }[] = [];
    if (applied.storeId) {
      const name = rows.find((r) => r.store_id === applied.storeId)?.store_name;
      out.push({ key: "storeId", label: ko ? `매장: ${name || "지정 매장"}` : `Store: ${name || "selected"}` });
    }
    if (applied.orderId) {
      const no = rows.find((r) => r.id === applied.orderId)?.order_no;
      out.push({ key: "orderId", label: ko ? `주문: ${no || "지정 주문"}` : `Order: ${no || "selected"}` });
    }
    if (applied.buyerUserId) {
      const b = rows.find((r) => r.buyer_user_id === applied.buyerUserId)?.buyer_label;
      out.push({ key: "buyerUserId", label: ko ? `구매자: ${b || "지정 구매자"}` : `Buyer: ${b || "selected"}` });
    }
    if (applied.adminQueue) out.push({ key: "adminQueue", label: ko ? "관리자 처리 필요 (액션 큐)" : "Admin action queue" });
    return out;
  }, [applied, ko, rows]);

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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label={ko ? "주문 현황" : "Order status"}>
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
        aria-label={ko ? "주문 검색" : "Search orders"}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "매장명" : "Store"}</span>
            <input className={INPUT} value={form.storeName} onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} placeholder={ko ? "매장명 일부" : "Store name"} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "주문번호" : "Order no."}</span>
            <input className={INPUT} value={form.orderNo} onChange={(e) => setForm((f) => ({ ...f, orderNo: e.target.value }))} placeholder="SO…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "구매자" : "Buyer"}</span>
            <input className={INPUT} value={form.buyer} onChange={(e) => setForm((f) => ({ ...f, buyer: e.target.value }))} placeholder={ko ? "닉네임" : "Nickname"} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "주문 상태" : "Order status"}</span>
            <select className={INPUT} value={form.orderStatus} onChange={(e) => setForm((f) => ({ ...f, orderStatus: e.target.value as SearchForm["orderStatus"] }))}>
              <option value="">{ko ? "전체" : "All"}</option>
              {STORE_ORDER_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "배달 / 픽업" : "Fulfillment"}</span>
            <select className={INPUT} value={form.fulfillment} onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value as SearchForm["fulfillment"] }))}>
              <option value="">{ko ? "전체" : "All"}</option>
              {ADMIN_STORE_ORDERS_FULFILLMENT_TYPES.map((v) => (
                <option key={v} value={v}>
                  {ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[v][lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{ko ? "결제 상태" : "Payment"}</span>
            <select className={INPUT} value={form.paymentStatus} onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value as SearchForm["paymentStatus"] }))}>
              <option value="">{ko ? "전체" : "All"}</option>
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
              {ko ? "조건 초기화" : "Reset"}
            </button>
            <button type="submit" className={PRIMARY_BTN} disabled={loadingAny} data-cta="search">
              {busy === "query" ? (ko ? "조회 중…" : "Searching…") : ko ? "조회" : "Search"}
            </button>
          </div>
        </div>
        {deepLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {deepLinks.map((d) => (
              <button key={d.key} type="button" className={chipClass(true)} onClick={() => clearDeepLink(d.key)} disabled={loadingAny} aria-label={ko ? `${d.label} 해제` : `Clear ${d.label}`}>
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
            ? ko
              ? `조회 시각 ${manilaSeconds(result.fetchedAt)}`
              : `Loaded ${manilaSeconds(result.fetchedAt)}`
            : ko
              ? "아직 조회하지 않았습니다"
              : "Not loaded yet"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <a href={exportHref} className={ROW_ACTION_BTN} download data-cta="csv">
            {ko ? "CSV 내려받기" : "Download CSV"}
          </a>
          <button type="button" className={ROW_ACTION_BTN} onClick={onRefresh} disabled={loadingAny || !result} data-cta="refresh">
            {busy === "refresh" ? (ko ? "새로고침 중…" : "Refreshing…") : ko ? "새로고침" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger" data-state="error">
          {errorText(error)}
          {result ? (ko ? " · 직전 조회 결과를 표시하고 있습니다." : " · Showing the previous result.") : ""}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-fg">{notice}</p>
      ) : null}

      {result ? <Pager page={applied.page} pageSize={result.pageSize} total={result.total} busy={loadingAny} onGo={onPage} lang={lang} /> : null}

      {!result && busy ? (
        <p className="py-8 text-center sam-text-body text-sam-muted" data-state="loading">{t("common_loading")}</p>
      ) : result && rows.length === 0 ? (
        <p className="py-8 text-center sam-text-body text-sam-muted" data-state="empty">
          {ko ? "조건에 맞는 주문이 없습니다." : "No orders match these filters."}
        </p>
      ) : result ? (
        <div className={`overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface ${busy ? "opacity-70" : ""}`} aria-busy={busy !== null}>
          <table className="min-w-[1180px] w-full text-left sam-text-helper">
            <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{ko ? "주문번호" : "Order no."}</th>
                <th className="px-3 py-2 font-medium">{ko ? "매장" : "Store"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "주문 상품" : "Items"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "구매자" : "Buyer"}</th>
                <th className="px-3 py-2 text-right font-medium">{ko ? "주문 금액" : "Amount"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "배달/픽업" : "Type"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "주문 상태" : "Status"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "결제 상태" : "Payment"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "수수료 정산" : "Commission"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "주문 일시" : "Ordered"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "완료 일시" : "Completed"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "상세" : "Detail"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const detailHref = `/admin/stores/orders/${encodeURIComponent(r.id)}`;
                const fulfill = ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[r.fulfillment_type as AdminStoreOrdersFulfillment]?.[lang] ?? r.fulfillment_type;
                const pay = ADMIN_STORE_ORDERS_PAYMENT_LABEL[r.payment_status as AdminStoreOrdersPaymentStatus]?.[lang] ?? r.payment_status;
                const rowBusy = decisionBusyId === r.id;
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
                            ? ko
                              ? `${r.first_title} 외 ${r.line_count - 1}건`
                              : `${r.first_title} +${r.line_count - 1}`
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
                          {ko ? "고객 결제 " : "Paid "}
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
                          <span className="sam-text-xxs text-sam-warning">{ko ? "지연" : "Delayed"}</span>
                        ) : null}
                        {r.order_status === "cancel_requested" || r.order_status === "refund_requested" ? (
                          <div className="flex gap-1" data-testid="admin-order-decision-actions">
                            <button
                              type="button"
                              className={ROW_ACTION_BTN}
                              disabled={decisionBusyId !== null || loadingAny}
                              onClick={() => void decide(r, r.order_status === "cancel_requested" ? "cancel_approve" : "refund_approve")}
                            >
                              {rowBusy
                                ? "…"
                                : r.order_status === "cancel_requested"
                                  ? t("admin_store_orders_cancel_request_approve")
                                  : t("admin_stores_orders_approve_refund")}
                            </button>
                            <button
                              type="button"
                              className={ROW_ACTION_BTN}
                              disabled={decisionBusyId !== null || loadingAny}
                              onClick={() => void decide(r, r.order_status === "cancel_requested" ? "cancel_reject" : "refund_reject")}
                            >
                              {rowBusy
                                ? "…"
                                : r.order_status === "cancel_requested"
                                  ? t("admin_store_orders_cancel_request_reject")
                                  : t("admin_stores_orders_reject_refund")}
                            </button>
                          </div>
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
                        <span className="sam-text-xxs text-sam-muted">{ko ? "부과 없음" : "Not charged"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-sam-muted">{formatManilaDateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-sam-muted">{r.completed_at ? formatManilaDateTime(r.completed_at) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Link href={detailHref} className={ROW_ACTION_BTN}>
                        {ko ? "상세 보기" : "View"}
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
      <p className="sam-text-xxs text-sam-muted">{ko ? "시간: 필리핀 시간 (UTC+8)" : "Times: Philippine time (UTC+8)"}</p>
    </div>
  );
}
