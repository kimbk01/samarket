"use client";

/**
 * 감사 로그 — store order audit records in operator wording, paged on the server.
 * State lives in the URL (category · q · period · page); the order number opens the shared detail modal,
 * and Back returns here with the same filters. QA records (D8) appear only under their own category.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminOrderAuditTable } from "@/components/admin/store-orders/AdminOrderAuditTable";
import {
  AdminOrderDetailModal,
  useAdminOrderDetailParam,
  withoutAdminOrderModalParams,
} from "@/components/admin/store-orders/AdminOrderDetailModal";
import { OpsPeriodFilter } from "@/components/admin/store-orders/AdminOrderOpsParts";
import { ADMIN_AUDIT_CATEGORY_LABEL } from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import {
  ADMIN_AUDIT_FILTER_CATEGORIES,
  ADMIN_ORDER_AUDIT_PAGE_SIZE,
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
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
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
          // 실패해도 직전 목록은 지우지 않는다 (§8-5).
          setError({ code: res.status === 403 ? "forbidden" : json?.error || "load_failed", status: res.status });
          if (res.status === 403) {
            setRows([]);
            setTotal(0);
          }
          return;
        }
        setRows(json.rows ?? []);
        setTotal(Number(json.total) || 0);
      })
      .catch(() => {
        if (!alive) return;
        setError({ code: "network_error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applied, reload]);

  const go = useCallback(
    (next: Partial<AdminOrderAuditQuery>) => {
      const q = { ...applied, page: 1, ...next };
      const qs = adminOrderAuditQueryToParams(q).toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [applied, pathname, router]
  );

  const onSubmit = () => go({ q: draftQ.trim() });
  const onReset = () => {
    setDraftQ("");
    router.push(pathname, { scroll: false });
  };
  const isFiltered = applied.category !== "all" || Boolean(applied.q) || applied.period !== "all";

  const catLabel = (c: AdminAuditFilterCategory) =>
    c === "all" ? (ko ? "전체 (QA 제외)" : "All (no QA)") : ko ? ADMIN_AUDIT_CATEGORY_LABEL[c].ko : ADMIN_AUDIT_CATEGORY_LABEL[c].en;

  return (
    <div className="space-y-4 p-4 md:p-6" data-admin-order-audit="1">
      {/* 헤더 표준 — 제목 = 메뉴명 「주문 처리 기록」 */}
      <AdminPageHeader
        titleKey="admin_menu_delivery_logs"
        description={
          ko
            ? "매장 주문에 남은 처리 기록입니다. 기록 시각 기준(마닐라)이며 기록은 수정·삭제되지 않습니다. 주문번호를 누르면 주문 상세가 열립니다."
            : "Records left on store orders, by record time (Manila). Records are never edited or deleted. Tap an order number to open its detail."
        }
      />
      <div className="flex justify-end">
        <AdminActionButton variant="secondary" disabled={loading} onClick={() => setReload((n) => n + 1)} data-cta="refresh">
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>

      <AdminTabs
        tabs={ADMIN_AUDIT_FILTER_CATEGORIES.map((c) => ({ id: c, label: catLabel(c) }))}
        ariaLabel={ko ? "구분" : "Category"}
        value={applied.category}
        syncUrl={false}
        onChange={(c) => go({ category: c as (typeof ADMIN_AUDIT_FILTER_CATEGORIES)[number] })}
      />

      <AdminFilterBar
        ko={ko}
        draft={{ q: draftQ, from: "", to: "" }}
        onDraftChange={(p) => {
          if (p.q !== undefined) setDraftQ(p.q);
        }}
        onSubmit={onSubmit}
        onReset={onReset}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={ko ? "주문번호" : "Order number"}
      >
        <OpsPeriodFilter
          period={applied.period}
          fromDay={applied.fromDay ?? ""}
          toDay={applied.toDay ?? ""}
          ko={ko}
          onChange={(n) => go({ period: n.period, fromDay: n.fromDay || null, toDay: n.toDay || null })}
        />
      </AdminFilterBar>

      {error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => setReload((n) => n + 1)} />
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" aria-busy={loading}>
        {loading && rows.length === 0 ? (
          <AdminLoadingState ko={ko} />
        ) : rows.length === 0 && !error ? (
          <AdminEmptyState ko={ko} onReset={isFiltered ? onReset : undefined} />
        ) : rows.length === 0 ? null : (
          <AdminOrderAuditTable rows={rows} statusLabel={statusLabel} onOpenOrder={(id) => modal.openOrder(id, "history")} />
        )}
        {rows.length > 0 ? (
          <AdminPagination
            ko={ko}
            page={applied.page}
            size={normalizeAdminListPageSize(applied.pageSize, ADMIN_ORDER_AUDIT_PAGE_SIZE)}
            total={total}
            disabled={loading}
            onPageChange={(p) => go({ page: p })}
            onSizeChange={(size) => go({ pageSize: size })}
          />
        ) : null}
      </section>

      <p className="sam-text-xxs text-sam-meta">
        {ko ? "주문 외 전체 작업 기록은 " : "All other activity records: "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          {ko ? "관리자 작업 기록" : "Admin activity log"}
        </Link>
      </p>

      <AdminOrderDetailModal orderId={modal.orderId} section={modal.section} onClose={modal.closeOrder} onChanged={() => setReload((n) => n + 1)} />
    </div>
  );
}

