"use client";

/**
 * 감사 로그 — store order audit records in operator wording, paged on the server.
 * State lives in the URL (category · q · period · page); the order number opens the shared detail modal,
 * and Back returns here with the same filters. QA records (D8) appear only under their own category.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminOrderAuditTable } from "@/components/admin/store-orders/AdminOrderAuditTable";
import {
  AdminOrderDetailModal,
  useAdminOrderDetailParam,
  withoutAdminOrderModalParams,
} from "@/components/admin/store-orders/AdminOrderDetailModal";
import { OPS_INPUT, OPS_PRIMARY_BTN, OPS_SECONDARY_BTN, OpsPager, OpsPeriodFilter } from "@/components/admin/store-orders/AdminOrderOpsParts";
import { ADMIN_AUDIT_CATEGORY_LABEL } from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import {
  ADMIN_AUDIT_FILTER_CATEGORIES,
  adminOrderAuditQueryToParams,
  parseAdminOrderAuditQuery,
  type AdminAuditFilterCategory,
  type AdminOrderAuditPageRow,
  type AdminOrderAuditQuery,
} from "@/lib/admin/store-orders/load-admin-store-order-audit";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";


export function AdminOrderAuditLogsScreen() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modal = useAdminOrderDetailParam();

  const listKey = withoutAdminOrderModalParams(searchParams.toString());
  const applied = useMemo(() => parseAdminOrderAuditQuery(new URLSearchParams(listKey)), [listKey]);
  const [draftQ, setDraftQ] = useState(applied.q);
  useEffect(() => setDraftQ(applied.q), [applied.q]);

  const [rows, setRows] = useState<AdminOrderAuditPageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const statusLabel = useCallback(
    (s: string) => {
      const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
      return key ? t(key) : s;
    },
    [t]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/store-orders/audit?${adminOrderAuditQueryToParams(applied).toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; total?: number; rows?: AdminOrderAuditPageRow[] } | null;
        if (!alive) return;
        if (!res.ok || !json?.ok) {
          setError(res.status === 403 ? (ko ? "권한이 없습니다." : "Forbidden.") : ko ? "감사 로그를 불러오지 못했습니다." : "Could not load audit records.");
          setRows([]);
          setTotal(0);
          return;
        }
        setRows(json.rows ?? []);
        setTotal(Number(json.total) || 0);
      })
      .catch(() => {
        if (!alive) return;
        setError(ko ? "네트워크 오류로 불러오지 못했습니다." : "Network error.");
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applied, ko, reload]);

  const go = useCallback(
    (next: Partial<AdminOrderAuditQuery>) => {
      const q = { ...applied, page: 1, ...next };
      const qs = adminOrderAuditQueryToParams(q).toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [applied, pathname, router]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go({ q: draftQ.trim() });
  };

  const catLabel = (c: AdminAuditFilterCategory) =>
    c === "all" ? (ko ? "전체 (QA 제외)" : "All (no QA)") : ko ? ADMIN_AUDIT_CATEGORY_LABEL[c].ko : ADMIN_AUDIT_CATEGORY_LABEL[c].en;

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-order-audit="1">
      <header>
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{ko ? "감사 로그" : "Audit log"}</h1>
        <p className="mt-1 sam-text-body text-sam-muted">
          {ko
            ? "매장 주문에 남은 처리 기록입니다. 기록 시각 기준(마닐라)이며 기록은 수정·삭제되지 않습니다. 주문번호를 누르면 주문 상세가 열립니다."
            : "Records left on store orders, by record time (Manila). Records are never edited or deleted. Tap an order number to open its detail."}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={ko ? "구분" : "Category"}>
        {ADMIN_AUDIT_FILTER_CATEGORIES.map((c) => {
          const active = c === applied.category;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go({ category: c })}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 sam-text-helper ${
                active ? "border-signature bg-signature/10 font-semibold text-signature" : "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-surface-muted"
              }`}
            >
              {catLabel(c)}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${OPS_INPUT} max-w-xs`}
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder={ko ? "주문번호" : "Order number"}
            aria-label={ko ? "주문번호" : "Order number"}
          />
          <button type="submit" className={OPS_PRIMARY_BTN}>
            {ko ? "조회" : "Search"}
          </button>
          <button
            type="button"
            className={OPS_SECONDARY_BTN}
            onClick={() => {
              setDraftQ("");
              router.push(pathname, { scroll: false });
            }}
          >
            {ko ? "초기화" : "Reset"}
          </button>
          <button type="button" className={OPS_SECONDARY_BTN} onClick={() => setReload((n) => n + 1)}>
            {ko ? "새로고침" : "Refresh"}
          </button>
        </div>
        <OpsPeriodFilter
          period={applied.period}
          fromDay={applied.fromDay ?? ""}
          toDay={applied.toDay ?? ""}
          ko={ko}
          onChange={(n) => go({ period: n.period, fromDay: n.fromDay || null, toDay: n.toDay || null })}
        />
      </form>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger">
          <span>{error}</span>
          <button type="button" className={OPS_SECONDARY_BTN} onClick={() => setReload((n) => n + 1)}>
            {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" aria-busy={loading}>
        {loading && rows.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>
        ) : rows.length === 0 && !error ? (
          <p className="sam-text-helper text-sam-muted">{ko ? "조건에 맞는 기록이 없습니다." : "No records match these filters."}</p>
        ) : (
          <AdminOrderAuditTable rows={rows} statusLabel={statusLabel} onOpenOrder={(id) => modal.openOrder(id, "history")} />
        )}
        <div className="mt-3">
          <OpsPager page={applied.page} pageSize={applied.pageSize} total={total} busy={loading} ko={ko} onGo={(p) => go({ page: p })} />
        </div>
      </section>

      <p className="sam-text-xxs text-sam-meta">
        {ko ? "주문 외 전체 감사 기록은 " : "All other audit records: "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          {ko ? "관리자 감사 로그" : "Admin audit log"}
        </Link>
      </p>

      <AdminOrderDetailModal orderId={modal.orderId} section={modal.section} onClose={modal.closeOrder} onChanged={() => setReload((n) => n + 1)} />
    </div>
  );
}

