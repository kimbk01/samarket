"use client";

/**
 * 관리자 주문 운영 — one screen component, four independent pages (each with its own URL, scope,
 * tabs, filters, columns and CTAs; v3 design §4/§6):
 *   list (주문 목록) · exceptions (주문 액션) · cancellations (취소 요청) · refunds (환불 요청)
 * Data: GET /api/admin/store-orders/ops (rows + total + tab counts, one RPC) and …/ops/summary.
 * Every order number opens the shared detail modal (`?order=`), so the list behind it never reloads.
 *
 * CTA: 조회 = apply the form → page 1, new snapshot · 새로고침 = same filters/page, new snapshot ·
 * 초기화 = screen defaults. A failed request keeps the previous result and shows the error (never 0 rows).
 * Return: list state lives in the URL; the scroll position is kept per URL in sessionStorage.
 */
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { normalizeAdminListPageSize, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import type { MessageKey } from "@/lib/i18n/messages";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { CommissionStateChip, type CommissionLang } from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  AdminOrderDetailModal,
  useAdminOrderDetailParam,
  withoutAdminOrderModalParams,
} from "@/components/admin/store-orders/AdminOrderDetailModal";
import {
  elapsedSince,
  OPS_INPUT,
  OPS_SECONDARY_BTN,
  OpsPeriodFilter,
  OpsSummaryPanel,
  type OpsSummaryCard,
} from "@/components/admin/store-orders/AdminOrderOpsParts";
import {
  ADMIN_ORDER_OPS_BASIS_LABEL,
  ADMIN_ORDER_OPS_PAGE_SIZE,
  ADMIN_ORDER_OPS_PATH,
  ADMIN_ORDER_OPS_PAYMENT_METHODS,
  ADMIN_ORDER_OPS_PERIOD_LABEL,
  ADMIN_ORDER_OPS_SCREEN,
  adminOrderExceptionReason,
  adminOrderOpsQueryToParams,
  adminOrderOpsTab,
  parseAdminOrderOpsQuery,
  type AdminOrderOpsPageResult,
  type AdminOrderOpsPaymentMethod,
  type AdminOrderOpsPeriod,
  type AdminOrderOpsQuery,
  type AdminOrderOpsRow,
  type AdminOrderOpsScreen as Screen,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import {
  ADMIN_CANCEL_REQUEST_STATUS_LABEL,
  ADMIN_ORDER_REQUESTER_LABEL,
  representativeItemLabel,
  toRequester,
} from "@/lib/admin/store-orders/admin-store-order-detail-contract";
import {
  ADMIN_STORE_ORDERS_FULFILLMENT_LABEL,
  ADMIN_STORE_ORDERS_FULFILLMENT_TYPES,
  ADMIN_STORE_ORDERS_PAYMENT_LABEL,
  ADMIN_STORE_ORDERS_PAYMENT_STATUSES,
  adminStoreOrderStatusChipClass,
  type AdminStoreOrdersFulfillment,
  type AdminStoreOrdersPaymentStatus,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { STORE_ORDER_STATUS_LIST, type StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatMoneyPhp } from "@/lib/utils/format";

type Form = {
  q: string;
  orderStatus: StoreOrderStatus | "";
  paymentStatus: AdminStoreOrdersPaymentStatus | "";
  paymentMethod: AdminOrderOpsPaymentMethod | "";
  fulfillment: AdminStoreOrdersFulfillment | "";
  mismatchOnly: boolean;
  period: AdminOrderOpsPeriod;
  fromDay: string;
  toDay: string;
};

type LoadMode = "query" | "refresh" | "page";

const formFromQuery = (q: AdminOrderOpsQuery): Form => ({
  q: q.q ?? "",
  orderStatus: q.orderStatus ?? "",
  paymentStatus: q.paymentStatus ?? "",
  paymentMethod: q.paymentMethod ?? "",
  fulfillment: q.fulfillment ?? "",
  mismatchOnly: q.mismatchOnly,
  period: q.period,
  fromDay: q.fromDay ?? "",
  toDay: q.toDay ?? "",
});

const applyForm = (q: AdminOrderOpsQuery, f: Form): AdminOrderOpsQuery => ({
  ...q,
  q: f.q.trim() || null,
  orderStatus: f.orderStatus || null,
  paymentStatus: f.paymentStatus || null,
  paymentMethod: f.paymentMethod || null,
  fulfillment: f.fulfillment || null,
  mismatchOnly: f.mismatchOnly,
  period: f.period,
  fromDay: f.period === "custom" ? f.fromDay || null : null,
  toDay: f.period === "custom" ? f.toDay || null : null,
  page: 1,
  asOf: null,
});

/** Page title = the admin menu label of each screen (admin-menu.ts key → message key). */
const ADMIN_ORDER_OPS_TITLE_KEY: Record<Screen, MessageKey> = {
  list: "admin_menu_delivery_order_list",
  exceptions: "admin_menu_store_orders_action_queue",
  cancellations: "admin_menu_delivery_cancel",
  refunds: "admin_menu_delivery_refund",
};

const PAYMENT_METHOD_LABEL: Record<AdminOrderOpsPaymentMethod, { ko: string; en: string }> = {
  cod: { ko: "현장 결제(COD)", en: "COD" },
  gcash: { ko: "GCash", en: "GCash" },
  bank_transfer: { ko: "계좌이체", en: "Bank transfer" },
  cash: { ko: "현금", en: "Cash" },
  other: { ko: "기타", en: "Other" },
  none: { ko: "결제수단 미기록", en: "Not recorded" },
};

const SUMMARY_OPEN_KEY = "dibay:admin-order-ops:summary-open";
const SCROLL_KEY = (k: string) => `dibay:admin-order-ops:scroll:${k}`;

export function AdminOrderOpsScreen({
  screen,
  fixed,
}: {
  screen: Screen;
  /** by-store / by-buyer pages: a fixed filter that the form cannot clear. */
  fixed?: { storeId?: string; buyerUserId?: string; label?: string };
}) {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const ko = lang === "ko";
  const cfg = ADMIN_ORDER_OPS_SCREEN[screen];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The list is keyed on the URL minus the modal params — opening a detail never reloads it.
  const listKey = withoutAdminOrderModalParams(searchParams.toString());
  const modal = useAdminOrderDetailParam();

  const withFixed = useCallback(
    (q: AdminOrderOpsQuery): AdminOrderOpsQuery => ({
      ...q,
      // 화면 페이지 크기는 표준 20/50/100 만 (API 는 대시보드·CSV 호출자 때문에 1..200 을 그대로 받는다).
      pageSize: normalizeAdminListPageSize(q.pageSize, ADMIN_ORDER_OPS_PAGE_SIZE as AdminListPageSize),
      storeId: fixed?.storeId ?? q.storeId,
      buyerUserId: fixed?.buyerUserId ?? q.buyerUserId,
    }),
    [fixed?.buyerUserId, fixed?.storeId]
  );

  const [applied, setApplied] = useState<AdminOrderOpsQuery>(() => withFixed(parseAdminOrderOpsQuery(screen, new URLSearchParams(listKey))));
  const [form, setForm] = useState<Form>(() => formFromQuery(applied));
  const [result, setResult] = useState<AdminOrderOpsPageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LoadMode | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUrlRef = useRef<string>(listKey);

  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  /** 주문 목록 only: same period, processing-date basis (cancel event time / refunded_at) — never the created cohort. */
  const [procSummary, setProcSummary] = useState<{ cancel: Record<string, unknown> | null; refund: Record<string, unknown> | null } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SUMMARY_OPEN_KEY);
      if (v === "0") setSummaryOpen(false);
    } catch {
      /* storage unavailable — default open */
    }
  }, []);
  const toggleSummary = () =>
    setSummaryOpen((o) => {
      try {
        window.localStorage.setItem(SUMMARY_OPEN_KEY, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });

  const statusLabel = useCallback(
    (s: string) => {
      const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
      return key ? t(key) : s;
    },
    [t]
  );

  const errorText = useCallback(
    (code: string) => {
      if (code === "forbidden") return ko ? "이 화면을 볼 권한이 없습니다." : "You do not have permission to view this screen.";
      if (code === "network_error") return ko ? "네트워크 오류로 불러오지 못했습니다." : "Network error.";
      if (code === "rpc_missing")
        return ko
          ? "기능 준비 중입니다. 시스템 관리자에게 문의하세요."
          : "This feature is not ready yet. Contact a system admin.";
      if (code === "load_failed") return ko ? "목록을 불러오지 못했습니다." : "Failed to load.";
      return ko
        ? `목록을 불러오지 못했습니다. ${adminOperatorErrorMessage(code, true)}`
        : `Failed to load. ${adminOperatorErrorMessage(code, false)}`;
    },
    [ko]
  );

  const loadSummary = useCallback(
    async (q: AdminOrderOpsQuery) => {
      if (!cfg.summaryScope) return;
      setSummaryLoading(true);
      setSummaryError(null);
      const p = new URLSearchParams({ scope: cfg.summaryScope });
      if (q.period !== "all") p.set("period", q.period);
      if (q.period === "custom") {
        if (q.fromDay) p.set("from", q.fromDay);
        if (q.toDay) p.set("to", q.toDay);
      }
      if (q.storeId) p.set("store_id", q.storeId);
      const fetchScope = async (scope: string) => {
        p.set("scope", scope);
        const res = await fetch(`/api/admin/store-orders/ops/summary?${p.toString()}`, { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; summary?: Record<string, unknown> };
        if (res.status === 401 || res.status === 403) throw new Error("forbidden");
        if (!res.ok || j.ok !== true) throw new Error(typeof j.error === "string" ? j.error : "load_failed");
        return j.summary ?? null;
      };
      try {
        if (cfg.summaryScope === "orders") {
          const [orders, cancel, refund] = await Promise.all([fetchScope("orders"), fetchScope("cancel"), fetchScope("refund")]);
          setSummary(orders);
          setProcSummary({ cancel, refund });
        } else {
          setSummary(await fetchScope(cfg.summaryScope));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "network_error";
        setSummaryError(errorText(msg === "Failed to fetch" ? "network_error" : msg));
      } finally {
        setSummaryLoading(false);
      }
    },
    [cfg.summaryScope, errorText]
  );

  const load = useCallback(
    async (qIn: AdminOrderOpsQuery, mode: LoadMode) => {
      const q = withFixed(qIn);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(mode);
      setError(null);

      // The URL carries the list state (fixed filters stay implicit on by-store / by-buyer pages).
      const urlParams = adminOrderOpsQueryToParams({ ...q, storeId: fixed?.storeId ? null : q.storeId, buyerUserId: fixed?.buyerUserId ? null : q.buyerUserId });
      if (q.page > 1) urlParams.set("page", String(q.page));
      if (q.pageSize !== ADMIN_ORDER_OPS_PAGE_SIZE) urlParams.set("page_size", String(q.pageSize));
      const urlQs = urlParams.toString();
      if (urlQs !== lastUrlRef.current) {
        lastUrlRef.current = urlQs;
        // Keep the modal params if a detail is open.
        const keep = new URLSearchParams(urlQs);
        const order = searchParams.get("order");
        if (order) keep.set("order", order);
        const section = searchParams.get("section");
        if (section) keep.set("section", section);
        const full = keep.toString();
        router.replace(full ? `${pathname}?${full}` : pathname, { scroll: false });
      }
      if (mode !== "page") void loadSummary(q);

      try {
        const qs = adminOrderOpsQueryToParams(q, { includePaging: true });
        qs.set("screen", screen);
        const res = await fetch(`/api/admin/store-orders/ops?${qs.toString()}`, { credentials: "include", cache: "no-store", signal: ac.signal });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<AdminOrderOpsPageResult>;
        if (ac.signal.aborted) return;
        if (res.status === 401 || res.status === 403) throw new Error("forbidden");
        if (!res.ok || json.ok !== true) throw new Error(typeof json.error === "string" ? json.error : "load_failed");
        const next = json as AdminOrderOpsPageResult;
        const pages = Math.max(1, Math.ceil(next.total / next.pageSize));
        if (next.rows.length === 0 && next.total > 0 && q.page > pages) {
          void load({ ...q, page: pages, asOf: next.asOf }, mode);
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
    [fixed?.buyerUserId, fixed?.storeId, loadSummary, pathname, router, screen, searchParams, withFixed]
  );

  // First load + external URL changes (links into this screen while it is open). Modal params excluded.
  useEffect(() => {
    if (result !== null && listKey === lastUrlRef.current) return;
    lastUrlRef.current = listKey;
    const q = withFixed(parseAdminOrderOpsQuery(screen, new URLSearchParams(listKey)));
    setApplied(q);
    setForm(formFromQuery(q));
    void load(q, "query");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the list URL changes
  }, [listKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Scroll position per list URL (return from another screen / the full detail page).
  const scrollKey = `${pathname}?${listKey}`;
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result || restoredRef.current === scrollKey) return;
    restoredRef.current = scrollKey;
    try {
      const y = Number(window.sessionStorage.getItem(SCROLL_KEY(scrollKey)));
      if (Number.isFinite(y) && y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
    } catch {
      /* storage unavailable */
    }
  }, [result, scrollKey]);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          window.sessionStorage.setItem(SCROLL_KEY(scrollKey), String(window.scrollY));
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [scrollKey]);

  const onSearch = () => void load(applyForm(applied, form), "query");
  /** 필터 바 「상태」 = 즉시 적용 (표준 — 나머지 입력은 「조회」 때 적용). */
  const onOrderStatus = (v: string) => {
    const next = { ...form, orderStatus: v as Form["orderStatus"] };
    setForm(next);
    void load(applyForm(applied, next), "query");
  };
  const onRefresh = () => void load({ ...applied, asOf: null }, "refresh");
  const onTab = (tab: string, extra?: Partial<AdminOrderOpsQuery>) => {
    // Tabs / summary cards change applied filters directly — keep the form in step so a later 조회
    // never re-applies a status / mismatch filter the tab just cleared.
    if (extra && ("orderStatus" in extra || "mismatchOnly" in extra)) {
      setForm((f) => ({
        ...f,
        ...("orderStatus" in extra ? { orderStatus: extra.orderStatus ?? "" } : {}),
        ...("mismatchOnly" in extra ? { mismatchOnly: extra.mismatchOnly === true } : {}),
      }));
    }
    void load({ ...applied, tab, page: 1, asOf: null, ...extra }, "query");
  };
  const onPage = (page: number) => void load({ ...applied, page }, "page");
  const onPageSize = (pageSize: AdminListPageSize) => void load({ ...applied, pageSize, page: 1 }, "page");
  const onReset = () => {
    const cleared = withFixed(parseAdminOrderOpsQuery(screen, new URLSearchParams()));
    setForm(formFromQuery(cleared));
    void load(cleared, "query");
  };
  const clearDeepLink = (key: "storeId" | "orderId" | "buyerUserId") =>
    void load({ ...applied, [key]: null, page: 1, asOf: null }, "query");

  // Row changed in the modal (admin action) → re-read the same page.
  const onModalChanged = useCallback(() => void load({ ...applied, asOf: null }, "refresh"), [applied, load]);

  const rows = result?.rows ?? [];
  const loadingAny = busy !== null;
  const tab = adminOrderOpsTab(applied);
  const periodLabel = ko ? ADMIN_ORDER_OPS_PERIOD_LABEL[applied.period].ko : ADMIN_ORDER_OPS_PERIOD_LABEL[applied.period].en;
  const periodParams = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.period !== "all") p.set("period", applied.period);
    if (applied.period === "custom") {
      if (applied.fromDay) p.set("from", applied.fromDay);
      if (applied.toDay) p.set("to", applied.toDay);
    }
    return p;
  }, [applied.fromDay, applied.period, applied.toDay]);
  const linkWith = (path: string, extra: Record<string, string>) => {
    const p = new URLSearchParams(periodParams);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `${path}?${p.toString()}`;
  };

  const exportHref = useMemo(() => {
    const p = adminOrderOpsQueryToParams(applied);
    p.set("view", "ops");
    p.set("screen", screen);
    if (applied.asOf) p.set("as_of", applied.asOf);
    return `/api/admin/store-orders/export?${p.toString()}`;
  }, [applied, screen]);

  const cards = useMemo<OpsSummaryCard[]>(() => {
    const s = summary as Record<string, Record<string, number | string | null> | number | string> | null;
    const blk = (k: string) => (s && typeof s[k] === "object" && s[k] ? (s[k] as Record<string, number | string | null>) : null);
    const n = (b: Record<string, number | string | null> | null, k: string) => (b && b[k] != null ? Number(b[k]) : null);
    if (cfg.summaryScope === "orders") {
      const fee = blk("commission");
      const proc = (scope: "cancel" | "refund", k: string) => {
        const src = procSummary?.[scope] as Record<string, unknown> | null | undefined;
        const b = src && typeof src[k] === "object" && src[k] ? (src[k] as Record<string, number | string | null>) : null;
        return b;
      };
      const cohort = ko ? `① ${periodLabel}에 생성된 주문 — 주문 생성일 기준 · 상태는 현재 기준` : `① Orders created in ${periodLabel} — created date · current status`;
      const work = ko ? `② ${periodLabel}의 요청·처리 실적 — 요청일·처리일 기준` : `② Requests and processing in ${periodLabel} — request / processing date`;
      const cPending = proc("cancel", "pending");
      const cDone = proc("cancel", "done");
      const rPending = proc("refund", "pending");
      const rDone = proc("refund", "done");
      return [
        { group: cohort, key: "all", label: ko ? "생성 주문" : "Created", count: n(blk("all"), "count"), amount: n(blk("all"), "order_amount"), amountLabel: ko ? "주문금액" : "Order", secondary: blk("all") ? `${ko ? "결제" : "Paid"} ${formatMoneyPhp(n(blk("all"), "paid") ?? 0)}` : null, basis: "created", onClick: () => onTab("all", { orderStatus: null, mismatchOnly: false }), active: tab.key === "all" && !applied.orderStatus && !applied.mismatchOnly },
        { group: cohort, key: "in_progress", label: ko ? "진행 중" : "In progress", count: n(blk("in_progress"), "count"), amount: n(blk("in_progress"), "order_amount"), amountLabel: ko ? "주문금액" : "Order", basis: "created", onClick: () => onTab("in_progress", { orderStatus: null }), active: tab.key === "in_progress" },
        { group: cohort, key: "completed", label: ko ? "완료" : "Completed", count: n(blk("completed"), "count"), amount: n(blk("completed"), "order_amount"), amountLabel: ko ? "주문금액" : "Order", secondary: blk("completed") ? `${ko ? "결제" : "Paid"} ${formatMoneyPhp(n(blk("completed"), "paid") ?? 0)}` : null, basis: "created", onClick: () => onTab("completed", { orderStatus: null }), active: tab.key === "completed" },
        { group: cohort, key: "cancel_requested", label: ko ? "현재 취소 요청 중" : "Now cancel-requested", count: n(blk("cancel_requested"), "count"), amount: n(blk("cancel_requested"), "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "created", onClick: () => onTab("cancel", { orderStatus: "cancel_requested" }), active: applied.orderStatus === "cancel_requested" },
        { group: cohort, key: "cancelled", label: ko ? "현재 취소 상태" : "Now cancelled", count: n(blk("cancelled"), "count"), amount: n(blk("cancelled"), "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "created", onClick: () => onTab("cancel", { orderStatus: "cancelled" }), active: applied.orderStatus === "cancelled" },
        { group: cohort, key: "refund_requested", label: ko ? "현재 환불 요청 중" : "Now refund-requested", count: n(blk("refund_requested"), "count"), amount: n(blk("refund_requested"), "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "created", onClick: () => onTab("refund", { orderStatus: "refund_requested" }), active: applied.orderStatus === "refund_requested" },
        { group: cohort, key: "refunded", label: ko ? "현재 환불 상태" : "Now refunded", count: n(blk("refunded"), "count"), amount: n(blk("refunded"), "paid"), amountLabel: ko ? "환불액" : "Refunded", basis: "created", onClick: () => onTab("refund", { orderStatus: "refunded" }), active: applied.orderStatus === "refunded" },
        { group: cohort, key: "commission", label: ko ? "수수료 부과" : "Commission", count: n(fee, "count"), amount: n(fee, "base_php"), amountLabel: ko ? "기준액" : "Base", secondary: fee ? `${ko ? "부과 수수료" : "Fee"} ${formatMoneyPhp((n(fee, "fee_minor") ?? 0) / 100)}` : null, basis: "created", href: "/admin/store-settlements" },
        { group: cohort, key: "mismatch", label: ko ? "⚠ 금액 불일치" : "⚠ Amount mismatch", count: s && s.mismatch != null ? Number(s.mismatch) : null, basis: "created", tone: "danger", onClick: () => onTab("all", { mismatchOnly: true, orderStatus: null }), active: applied.mismatchOnly },
        { group: work, key: "cancel_pending", label: ko ? "취소 요청 대기" : "Cancel requests waiting", count: n(cPending, "count"), amount: n(cPending, "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "cancel_requested", tone: "warning", href: linkWith(ADMIN_ORDER_OPS_PATH.cancellations, { tab: "pending" }) },
        { group: work, key: "cancel_done", label: ko ? "취소 처리" : "Cancelled (processed)", count: n(cDone, "count"), amount: n(cDone, "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "cancelled", href: linkWith(ADMIN_ORDER_OPS_PATH.cancellations, { tab: "done" }) },
        { group: work, key: "refund_pending", label: ko ? "환불 요청 대기" : "Refund requests waiting", count: n(rPending, "count"), amount: n(rPending, "paid"), amountLabel: ko ? "결제액" : "Paid", basis: "refund_requested", tone: "warning", href: linkWith(ADMIN_ORDER_OPS_PATH.refunds, { tab: "pending" }) },
        { group: work, key: "refund_done", label: ko ? "환불 처리" : "Refunded (processed)", count: n(rDone, "count"), amount: n(rDone, "paid"), amountLabel: ko ? "환불액" : "Refunded", basis: "refunded", href: linkWith(ADMIN_ORDER_OPS_PATH.refunds, { tab: "done" }) },
      ];
    }
    if (cfg.summaryScope === "cancel" || cfg.summaryScope === "refund") {
      const pending = blk("pending");
      const done = blk("done");
      const isCancel = cfg.summaryScope === "cancel";
      const out: OpsSummaryCard[] = [
        { key: "pending", label: ko ? "매장 결정 대기" : "Awaiting store", count: n(pending, "count"), amount: n(pending, "paid"), amountLabel: ko ? "결제액" : "Paid", secondary: pending?.oldest_at ? `${ko ? "가장 오래된 대기" : "Oldest"} ${elapsedSince(String(pending.oldest_at), ko)}` : null, basis: isCancel ? "cancel_requested" : "refund_requested", tone: "warning", onClick: () => onTab("pending"), active: tab.key === "pending" },
        { key: "done", label: isCancel ? (ko ? "취소 완료" : "Cancelled") : ko ? "환불 완료" : "Refunded", count: n(done, "count"), amount: n(done, "paid"), amountLabel: isCancel ? (ko ? "결제액" : "Paid") : ko ? "환불액" : "Refunded", secondary: !isCancel && done ? `${ko ? "상품권 복원" : "Gift reversed"} ${n(done, "gift_reversed") ?? 0}${ko ? "건" : ""}` : null, basis: isCancel ? "cancelled" : "refunded", onClick: () => onTab("done"), active: tab.key === "done" },
      ];
      if (!isCancel) {
        out.push({ key: "commission_review", label: ko ? "수수료 검토 대기" : "Commission review", count: s && s.commission_review != null ? Number(s.commission_review) : null, basis: "current", href: "/admin/store-settlements?state=review_required" });
      }
      return out;
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTab/linkWith read `applied`, listed
  }, [summary, procSummary, cfg.summaryScope, ko, applied, tab.key, periodParams, periodLabel]);

  const deepLinks: { key: "storeId" | "orderId" | "buyerUserId"; label: string }[] = [];
  if (applied.storeId && !fixed?.storeId) {
    const name = rows.find((r) => r.store_id === applied.storeId)?.store_name;
    deepLinks.push({ key: "storeId", label: ko ? `매장: ${name || "지정 매장"}` : `Store: ${name || "selected"}` });
  }
  if (applied.orderId) {
    const no = rows.find((r) => r.id === applied.orderId)?.order_no;
    deepLinks.push({ key: "orderId", label: ko ? `주문: ${no || "지정 주문"}` : `Order: ${no || "selected"}` });
  }
  if (applied.buyerUserId && !fixed?.buyerUserId) {
    const b = rows.find((r) => r.buyer_user_id === applied.buyerUserId)?.buyer_label;
    deepLinks.push({ key: "buyerUserId", label: ko ? `구매자: ${b || "지정 구매자"}` : `Buyer: ${b || "selected"}` });
  }

  const fixedLabel = fixed?.storeId
    ? `${ko ? "매장" : "Store"}: ${rows.find((r) => r.store_id === fixed.storeId)?.store_name || fixed.label || fixed.storeId}`
    : fixed?.buyerUserId
      ? `${ko ? "구매자" : "Buyer"}: ${rows.find((r) => r.buyer_user_id === fixed.buyerUserId)?.buyer_label || fixed.label || fixed.buyerUserId}`
      : null;

  const open = (r: AdminOrderOpsRow) => modal.openOrder(r.id, cfg.section);
  const pay = (r: AdminOrderOpsRow) => ADMIN_STORE_ORDERS_PAYMENT_LABEL[r.payment_status as AdminStoreOrdersPaymentStatus]?.[lang] ?? r.payment_status;
  const method = (r: AdminOrderOpsRow) =>
    r.buyer_payment_method ? formatBuyerPaymentDisplay(r.buyer_payment_method, null, lang) : ko ? "결제수단 미기록" : "Not recorded";
  const fulfill = (r: AdminOrderOpsRow) =>
    ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[r.fulfillment_type as AdminStoreOrdersFulfillment]?.[lang] ?? r.fulfillment_type;
  const role = (v: string | null) => {
    const k = toRequester(v);
    return ko ? ADMIN_ORDER_REQUESTER_LABEL[k].ko : ADMIN_ORDER_REQUESTER_LABEL[k].en;
  };
  const OrderNo = ({ r }: { r: AdminOrderOpsRow }) => (
    <AdminActionButton variant="ghost" size="sm" onClick={() => open(r)} className="!h-auto !px-0 font-mono font-medium" data-open-order={r.order_no}>
      {r.order_no}
    </AdminActionButton>
  );

  const header = (labels: string[]) => (
    <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
      <tr>
        {labels.map((l, i) => (
          <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
            {l}
          </th>
        ))}
      </tr>
    </thead>
  );

  const td = "px-3 py-2.5";

  const renderTable = () => {
    if (screen === "list") {
      return (
        <table className="w-full min-w-[1240px] text-left sam-text-helper">
          {header([
            ko ? "주문번호" : "Order no.",
            ko ? "주문 일시" : "Ordered",
            ko ? "매장" : "Store",
            ko ? "구매자" : "Buyer",
            ko ? "상품" : "Items",
            ko ? "방식" : "Type",
            ko ? "주문금액 / 결제액" : "Order / paid",
            ko ? "결제" : "Payment",
            ko ? "주문 상태" : "Status",
            ko ? "수수료" : "Commission",
            ko ? "완료 일시" : "Completed",
            "",
          ])}
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-sam-border-soft align-top last:border-b-0 hover:bg-sam-app" data-order-row={r.order_no}>
                <td className={`whitespace-nowrap ${td}`}>
                  <OrderNo r={r} />
                </td>
                <td className={`whitespace-nowrap tabular-nums text-sam-muted ${td}`}>{formatManilaDateTime(r.created_at)}</td>
                <td className={`max-w-[160px] truncate text-sam-fg ${td}`} title={r.store_name}>
                  {r.store_name || "—"}
                </td>
                <td className={`max-w-[120px] truncate text-sam-fg ${td}`} title={r.buyer_label}>
                  {r.buyer_label || "—"}
                </td>
                <td className={`max-w-[200px] text-sam-fg ${td}`}>
                  <span className="line-clamp-2" title={r.first_title ?? ""}>
                    {representativeItemLabel(r.first_title, r.line_count, ko)}
                  </span>
                </td>
                <td className={`whitespace-nowrap text-sam-fg ${td}`}>{fulfill(r)}</td>
                <td className={`whitespace-nowrap text-right tabular-nums ${td}`}>
                  <div className="font-medium text-sam-fg">{formatMoneyPhp(r.total_amount)}</div>
                  <div className="sam-text-xxs text-sam-muted">
                    {ko ? "결제 " : "Paid "}
                    {formatMoneyPhp(r.payment_amount)}
                  </div>
                </td>
                <td className={td}>
                  <div className="whitespace-nowrap text-sam-fg">{method(r)}</div>
                  <div className="whitespace-nowrap sam-text-xxs text-sam-muted">{pay(r)}</div>
                </td>
                <td className={td}>
                  <div className="flex flex-col items-start gap-1">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${adminStoreOrderStatusChipClass(r.order_status)}`}>
                      {statusLabel(r.order_status)}
                    </span>
                    {r.order_status === "cancel_requested" || r.order_status === "refund_requested" ? (
                      <Link
                        href={`${r.order_status === "cancel_requested" ? ADMIN_ORDER_OPS_PATH.cancellations : ADMIN_ORDER_OPS_PATH.refunds}?tab=pending&q=${encodeURIComponent(r.order_no)}`}
                        className="whitespace-nowrap rounded-full bg-sam-warning-soft px-2 py-0.5 sam-text-xxs font-semibold text-sam-warning underline"
                      >
                        {ko ? "매장 결정 대기 →" : "Awaiting store →"}
                      </Link>
                    ) : null}
                    {r.needs_admin_attention && !["completed", "cancelled", "refunded", "cancel_requested", "refund_requested"].includes(r.order_status) ? (
                      <Link href={`${ADMIN_ORDER_OPS_PATH.exceptions}?order=${r.id}&section=admin`} className="whitespace-nowrap rounded-full bg-sam-danger-soft px-2 py-0.5 sam-text-xxs font-semibold text-sam-danger underline">
                        {ko ? "운영 예외 →" : "Exception →"}
                      </Link>
                    ) : null}
                    {r.money_mismatch ? (
                      <AdminActionButton
                        variant="quiet"
                        size="sm"
                        onClick={() => modal.openOrder(r.id, "payment")}
                        className="!h-auto !rounded-full bg-sam-danger-soft !px-2 py-0.5 !text-[12px] !text-sam-danger"
                      >
                        {ko ? "금액 불일치" : "Amount mismatch"}
                      </AdminActionButton>
                    ) : null}
                    {r.sla_warning_level ? <span className="sam-text-xxs text-sam-warning">{ko ? "지연" : "Delayed"}</span> : null}
                  </div>
                </td>
                <td className={td}>
                  {r.commission_state ? <CommissionStateChip state={r.commission_state} lang={lang} /> : <span className="sam-text-xxs text-sam-muted">{ko ? "부과 없음" : "Not charged"}</span>}
                </td>
                <td className={`whitespace-nowrap tabular-nums text-sam-muted ${td}`}>{r.completed_at ? formatManilaDateTime(r.completed_at) : "—"}</td>
                <td className={td}>
                  <AdminActionButton variant="ghost" size="sm" onClick={() => open(r)}>
                    {adminCta("detail", ko)}
                  </AdminActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (screen === "exceptions") {
      return (
        <table className="w-full min-w-[1040px] text-left sam-text-helper">
          {header([
            ko ? "주문번호" : "Order no.",
            ko ? "매장" : "Store",
            ko ? "예외 사유" : "Reason",
            ko ? "주문 일시" : "Ordered",
            ko ? "경과" : "Age",
            ko ? "주문 상태" : "Status",
            ko ? "배달 상태" : "Delivery",
            ko ? "결제액" : "Paid",
            "",
          ])}
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-sam-border-soft align-top last:border-b-0 hover:bg-sam-app" data-order-row={r.order_no}>
                <td className={`whitespace-nowrap ${td}`}>
                  <OrderNo r={r} />
                </td>
                <td className={`max-w-[160px] truncate text-sam-fg ${td}`} title={r.store_name}>
                  {r.store_name || "—"}
                </td>
                <td className={`text-sam-fg ${td}`}>{adminOrderExceptionReason(r, ko)}</td>
                <td className={`whitespace-nowrap tabular-nums text-sam-muted ${td}`}>{formatManilaDateTime(r.created_at)}</td>
                <td className={`whitespace-nowrap tabular-nums text-sam-fg ${td}`}>{elapsedSince(r.created_at, ko)}</td>
                <td className={td}>
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${adminStoreOrderStatusChipClass(r.order_status)}`}>
                    {statusLabel(r.order_status)}
                  </span>
                </td>
                <td className={`whitespace-nowrap text-sam-fg ${td}`}>{r.delivery_status ? adminStatusLabel("rider_delivery", r.delivery_status, ko).label : "—"}</td>
                <td className={`whitespace-nowrap text-right tabular-nums ${td}`}>{formatMoneyPhp(r.payment_amount)}</td>
                <td className={td}>
                  <AdminActionButton variant="ghost" size="sm" onClick={() => modal.openOrder(r.id, "admin")}>
                    {ko ? "처리" : "Handle"}
                  </AdminActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    // cancellations / refunds
    const isCancel = screen === "cancellations";
    return (
      <table className="w-full min-w-[1240px] text-left sam-text-helper">
        {header([
          ko ? "주문번호" : "Order no.",
          ko ? "매장" : "Store",
          ko ? "요청자" : "Requested by",
          ko ? "요청 사유" : "Reason",
          ko ? "요청 시각" : "Requested",
          ko ? "경과" : "Age",
          isCancel ? (ko ? "결제액" : "Paid") : ko ? "환불(요청) 금액" : "Refund amount",
          ...(isCancel ? [] : [ko ? "결제수단 · 상품권" : "Method · gift", ko ? "수수료" : "Commission"]),
          ko ? "결정 주체" : "Decides",
          ko ? "처리 결과" : "Result",
          "",
        ])}
        <tbody>
          {rows.map((r) => {
            const requestedAt = isCancel ? r.cancel_requested_at : r.refund_requested_at;
            const requester = isCancel ? (r.cancel_requested_role ? role(r.cancel_requested_role) : null) : r.refund_requested_role ? role(r.refund_requested_role) : null;
            const reason = isCancel ? r.cancel_reason : r.refund_reason;
            const pending = r.order_status === (isCancel ? "cancel_requested" : "refund_requested");
            const closedAt = isCancel ? r.cancel_decided_at ?? r.cancelled_at : r.refunded_at;
            const result = pending
              ? ko
                ? "매장 결정 대기"
                : "Awaiting store"
              : isCancel
                ? r.cancel_request_status
                  ? (ADMIN_CANCEL_REQUEST_STATUS_LABEL[r.cancel_request_status]?.[lang] ?? r.cancel_request_status)
                  : ko
                    ? "즉시 취소 (요청 기록 없음)"
                    : "Direct cancel (no request)"
                : statusLabel(r.order_status);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top last:border-b-0 hover:bg-sam-app" data-order-row={r.order_no}>
                <td className={`whitespace-nowrap ${td}`}>
                  <OrderNo r={r} />
                  {isCancel && r.cancel_requested_role === "owner" && pending ? (
                    <div className="mt-1 sam-text-xxs text-sam-muted">{ko ? "매장 요청 (3단계 이전)" : "Store request (legacy)"}</div>
                  ) : null}
                </td>
                <td className={`max-w-[160px] truncate text-sam-fg ${td}`} title={r.store_name}>
                  {r.store_name || "—"}
                </td>
                <td className={`whitespace-nowrap text-sam-fg ${td}`}>{requester ?? (ko ? "기록 없음" : "Not recorded")}</td>
                <td className={`max-w-[220px] text-sam-fg ${td}`}>
                  <span className="line-clamp-2" title={reason ?? ""}>
                    {reason || (ko ? "사유 없음" : "No reason")}
                  </span>
                </td>
                <td className={`whitespace-nowrap tabular-nums text-sam-muted ${td}`}>{requestedAt ? formatManilaDateTime(requestedAt) : "—"}</td>
                <td className={`whitespace-nowrap tabular-nums text-sam-fg ${td}`}>{pending ? elapsedSince(requestedAt ?? r.created_at, ko) : "—"}</td>
                <td className={`whitespace-nowrap text-right tabular-nums ${td}`}>{formatMoneyPhp(r.payment_amount)}</td>
                {isCancel ? null : (
                  <>
                    <td className={td}>
                      <div className="whitespace-nowrap text-sam-fg">{method(r)}</div>
                      {r.gift_amount > 0 ? (
                        <div className="whitespace-nowrap sam-text-xxs text-sam-muted">
                          {ko ? "상품권" : "Gift"} {formatMoneyPhp(r.gift_amount)} {r.gift_reversed ? (ko ? "· 복원됨" : "· reversed") : ko ? "· 미복원" : "· not reversed"}
                        </div>
                      ) : null}
                    </td>
                    <td className={td}>
                      {r.commission_state ? <CommissionStateChip state={r.commission_state} lang={lang} /> : <span className="sam-text-xxs text-sam-muted">{ko ? "부과 없음" : "Not charged"}</span>}
                      {r.commission_state === "review_required" ? (
                        <AdminActionLink variant="ghost" size="sm" className="mt-1" href={`/admin/store-settlements?state=review_required&order_no=${encodeURIComponent(r.order_no)}`}>
                          {ko ? "수수료 검토" : "Review commission"}
                        </AdminActionLink>
                      ) : null}
                    </td>
                  </>
                )}
                <td className={`whitespace-nowrap text-sam-fg ${td}`}>{ko ? "매장" : "Store"}</td>
                <td className={td}>
                  <div className="text-sam-fg">{result}</div>
                  {!pending && closedAt ? (
                    <div className="sam-text-xxs text-sam-muted">
                      {formatManilaDateTime(closedAt)}
                      {r.decided_role ? ` · ${role(r.decided_role)}` : ""}
                    </div>
                  ) : null}
                  {isCancel && r.cancel_rejected_reason ? (
                    <div className="sam-text-xxs text-sam-muted">
                      {ko ? "반려 사유" : "Reason"}: {r.cancel_rejected_reason}
                    </div>
                  ) : null}
                </td>
                <td className={td}>
                  <div className="flex flex-col items-start gap-1">
                    <AdminActionButton variant="ghost" size="sm" onClick={() => open(r)}>
                      {adminCta("detail", ko)}
                    </AdminActionButton>
                    <AdminActionLink variant="ghost" size="sm" href={`/admin/stores/orders/logs?q=${encodeURIComponent(r.order_no)}`}>
                      {ko ? "처리 이력" : "History"}
                    </AdminActionLink>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const basisNote = cfg.summaryScope === "orders"
    ? ko
      ? `${periodLabel} · 마닐라 날짜 · 「전체 기간」은 서비스 시작부터 누적`
      : `${periodLabel} · Manila dates · "All time" = cumulative since launch`
    : ko
      ? `카드마다 기준 시각 표시 · ${periodLabel}`
      : `Each card states its basis · ${periodLabel}`;

  const emptyText =
    screen === "exceptions"
      ? ko
        ? "처리할 운영 예외가 없습니다. 일반 취소·환불은 매장이 처리합니다."
        : "No exceptions to handle. Regular cancel/refund decisions belong to the store."
      : ko
        ? "조건에 맞는 주문이 없습니다."
        : "No orders match these filters.";

  return (
    <div className="space-y-4" data-admin-order-ops={screen}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* 헤더 표준 — 제목 = 메뉴명 (R1 §0) */}
          <AdminPageHeader titleKey={ADMIN_ORDER_OPS_TITLE_KEY[screen]} description={ko ? cfg.descKo : cfg.descEn} />
          {fixedLabel ? <p className="-mt-2 sam-text-helper font-medium text-sam-fg">{fixedLabel}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {screen !== "exceptions" ? (
            <a href={exportHref} className={OPS_SECONDARY_BTN} download data-cta="csv">
              {adminCta("exportCsv", ko)}
            </a>
          ) : null}
          <AdminActionButton variant="secondary" onClick={onRefresh} disabled={loadingAny || !result} data-cta="refresh">
            {adminCta("refresh", ko)}
          </AdminActionButton>
        </div>
      </header>

      {screen === "exceptions" ? (
        <p className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper text-sam-muted">
          {ko ? "일반 취소·환불 결정은 매장 업무입니다 — " : "Regular cancel/refund decisions belong to the store — "}
          <Link className="underline" href={`${ADMIN_ORDER_OPS_PATH.cancellations}?tab=pending`}>
            {ko ? "취소 요청 보기" : "Cancellations"}
          </Link>
          {" · "}
          <Link className="underline" href={`${ADMIN_ORDER_OPS_PATH.refunds}?tab=pending`}>
            {ko ? "환불 요청 보기" : "Refunds"}
          </Link>
        </p>
      ) : null}

      {/* The summary RPC has no buyer filter, so a by-buyer page would show every buyer's figures — not shown there. */}
      {cfg.summaryScope && !fixed?.buyerUserId ? (
        <OpsSummaryPanel
          title={ko ? "현황" : "Overview"}
          basisNote={basisNote}
          cards={cards}
          open={summaryOpen}
          onToggle={toggleSummary}
          loading={summaryLoading}
          error={summaryError}
          ko={ko}
        />
      ) : null}

      {cfg.tabs.length > 1 ? (
        <AdminTabs
          ariaLabel={ko ? "구분" : "Tabs"}
          syncUrl={false}
          value={tab.key}
          onChange={(id) => onTab(id, { orderStatus: null })}
          tabs={cfg.tabs.map((tb) => {
            const count = result?.tabCounts[tb.key];
            return { id: tb.key, label: ko ? tb.ko : tb.en, count: typeof count === "number" ? count : null };
          })}
        />
      ) : null}

      <AdminFilterBar
        ko={ko}
        draft={{ q: form.q, from: "", to: "" }}
        onDraftChange={(p) => {
          if (p.q !== undefined) setForm((f) => ({ ...f, q: p.q ?? "" }));
        }}
        onSubmit={onSearch}
        onReset={onReset}
        pending={loadingAny}
        showPeriod={false}
        searchPlaceholder={ko ? "주문번호 · 매장 · 구매자 (예: SO179…)" : "Order no. · store · buyer (e.g. SO179…)"}
        status={
          screen === "list"
            ? {
                label: ko ? "주문 상태" : "Order status",
                value: form.orderStatus,
                onChange: onOrderStatus,
                options: STORE_ORDER_STATUS_LIST.map((s) => ({ value: s, label: statusLabel(s) })),
              }
            : undefined
        }
      >
        <label className="flex flex-col gap-1 sam-text-xxs text-sam-muted">
          {ko ? "결제수단" : "Payment method"}
          <select className={OPS_INPUT} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as Form["paymentMethod"] }))}>
            <option value="">{ko ? "전체" : "All"}</option>
            {ADMIN_ORDER_OPS_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {ko ? PAYMENT_METHOD_LABEL[m].ko : PAYMENT_METHOD_LABEL[m].en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sam-text-xxs text-sam-muted">
          {ko ? "결제 상태" : "Payment status"}
          <select className={OPS_INPUT} value={form.paymentStatus} onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value as Form["paymentStatus"] }))}>
            <option value="">{ko ? "전체" : "All"}</option>
            {ADMIN_STORE_ORDERS_PAYMENT_STATUSES.map((v) => (
              <option key={v} value={v}>
                {ADMIN_STORE_ORDERS_PAYMENT_LABEL[v][lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sam-text-xxs text-sam-muted">
          {ko ? "수령 방식" : "Fulfillment"}
          <select className={OPS_INPUT} value={form.fulfillment} onChange={(e) => setForm((f) => ({ ...f, fulfillment: e.target.value as Form["fulfillment"] }))}>
            <option value="">{ko ? "전체" : "All"}</option>
            {ADMIN_STORE_ORDERS_FULFILLMENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[v][lang]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="sam-text-xxs text-sam-muted">
            {ko ? "기간 · 기준: " : "Period · basis: "}
            {ko ? ADMIN_ORDER_OPS_BASIS_LABEL[tab.basis].ko : ADMIN_ORDER_OPS_BASIS_LABEL[tab.basis].en}
          </span>
          <OpsPeriodFilter period={form.period} fromDay={form.fromDay} toDay={form.toDay} ko={ko} onChange={(next) => setForm((f) => ({ ...f, ...next }))} />
        </div>
        {screen === "list" ? (
          <label className="flex h-10 items-center gap-1.5 sam-text-helper text-sam-fg">
            <input type="checkbox" checked={form.mismatchOnly} onChange={(e) => setForm((f) => ({ ...f, mismatchOnly: e.target.checked }))} />
            {ko ? "금액 불일치만" : "Mismatch only"}
          </label>
        ) : null}
      </AdminFilterBar>
      {deepLinks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {deepLinks.map((d) => (
            <AdminChipButton key={d.key} selected onClick={() => clearDeepLink(d.key)} disabled={loadingAny} aria-label={ko ? `${d.label} 해제` : `Clear ${d.label}`}>
              {d.label} ✕
            </AdminChipButton>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 sam-text-xxs text-sam-muted">
        <span data-fetched-at={result?.fetchedAt ?? ""}>
          {result ? `${ko ? "조회 시각" : "Loaded"} ${formatManilaDateTime(result.fetchedAt)} (PHT)` : ko ? "아직 조회하지 않았습니다" : "Not loaded yet"}
        </span>
        <span>{ko ? "시간: 필리핀 시간 (UTC+8)" : "Times: Philippine time (UTC+8)"}</span>
      </div>

      {error ? (
        <div className="space-y-1" data-state="error">
          <AdminErrorState ko={ko} code={error} httpStatus={error === "forbidden" ? 403 : undefined} onRetry={error === "forbidden" ? undefined : onRefresh} />
          {result && error !== "forbidden" ? (
            <p className="sam-text-xxs text-sam-muted">{ko ? "직전 조회 결과를 표시하고 있습니다." : "Showing the previous result."}</p>
          ) : null}
        </div>
      ) : null}

      {!result && busy ? (
        <AdminLoadingState ko={ko} />
      ) : result && rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={emptyText} onReset={screen !== "exceptions" ? onReset : undefined} />
      ) : result ? (
        <div className={`overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface ${busy ? "opacity-70" : ""}`} aria-busy={busy !== null}>
          {renderTable()}
        </div>
      ) : null}

      {result && rows.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={applied.page}
          size={normalizeAdminListPageSize(applied.pageSize, ADMIN_ORDER_OPS_PAGE_SIZE as AdminListPageSize)}
          total={result.total}
          onPageChange={onPage}
          onSizeChange={onPageSize}
          disabled={loadingAny}
        />
      ) : null}

      <AdminOrderDetailModal orderId={modal.orderId} section={modal.section} onClose={modal.closeOrder} onChanged={onModalChanged} />
    </div>
  );
}
