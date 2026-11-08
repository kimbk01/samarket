"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { adminListOffsetForPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

/**
 * G-08 (감사 2026-10-30) — 중앙 고객지원 안의 「매장 문의」 조회 전용 보기.
 * - 원장: `store_inquiries` (고객 → 매장). 답변은 매장 사장님이 한다 — 관리자는 조회만 (답변·상태 변경 CTA 없음).
 * - 고객지원 상담(`support_cases`)과 원장을 합치지 않는다: 같은 목록·같은 건수에 섞지 않고 별도 보기로만 둔다.
 * - 데이터: 기존 GET /api/admin/store-inquiries (limit·offset 서버 페이지). 각 행 → /admin/store-inquiries?store_id=…
 */

type StoreInquiryRow = {
  id: string;
  store_id: string;
  store_name?: string | null;
  from_user_label?: string | null;
  inquiry_type: string;
  subject: string;
  status: string;
  answered_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 20 as const;

const STATUS_LABELS: Record<string, { ko: string; en: string; tone: AdminTone }> = {
  open: { ...catalogPair("admin_unanswered"), tone: "waiting" },
  answered: { ...catalogPair("admin_platform_inquiry_status_answered"), tone: "success" },
  closed: { ...catalogPair("admin_stores_inquiries_status_closed"), tone: "neutral" },
  escalated: { ...catalogPair("admin_escalated"), tone: "warning" },
};

const TYPE_LABELS: Record<string, MessageKey> = {
  product: "admin_support_store_inquiry_type_product",
  order: "admin_support_store_inquiry_type_order",
  store: "admin_support_store_inquiry_type_store",
  complaint: "admin_support_store_inquiry_type_complaint",
};

export function storeInquiryAdminHref(storeId: string | null | undefined): string {
  const id = String(storeId ?? "").trim();
  return id ? `/admin/store-inquiries?store_id=${encodeURIComponent(id)}` : "/admin/store-inquiries";
}

export function AdminSupportStoreInquiriesPanel({ ko }: { ko: boolean }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StoreInquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(adminListOffsetForPage(p, PAGE_SIZE)),
      });
      const res = await fetch(`/api/admin/store-inquiries?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; inquiries?: StoreInquiryRow[]; total?: number; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다.
        setLoadError({ code: res.status === 403 ? "forbidden" : (json?.error ?? "load_failed"), status: res.status });
        return;
      }
      setLoadError(null);
      setRows(json.inquiries ?? []);
      setTotal(Number(json.total) || 0);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-admin-support-store-inquiries="read-only"
      aria-label={translateBy(ko ? "ko" : "en", "admin_support_store_inquiries_view_only")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sam-muted">
          {translateBy(ko ? "ko" : "en", "admin_support_inquiries_customers_sent_to_stores_store")}
        </p>
        <Link href="/admin/store-inquiries" className="text-xs font-semibold text-sam-fg underline">
          {translateBy(ko ? "ko" : "en", "admin_support_open_store_inquiries")}
        </Link>
      </div>
      <div className="text-xs font-semibold text-sam-muted">
        {translateBy(ko ? "ko" : "en", "admin_support_store_inquiries")} · {translateBy(ko ? "ko" : "en", "admin_count_items", { n: formatAdminNumber(total) })}
      </div>

      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load(page)} />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState ko={ko} message={translateBy(ko ? "ko" : "en", "admin_support_no_store_inquiries")} />
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-sam-border overflow-y-auto">
          {rows.map((r) => {
            const st = STATUS_LABELS[r.status];
            const type = TYPE_LABELS[r.inquiry_type];
            return (
              <li key={r.id}>
                <Link
                  href={storeInquiryAdminHref(r.store_id)}
                  className="block px-1 py-2 hover:bg-sam-app"
                  data-admin-support-store-inquiry-row={r.id}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AdminToneBadge tone={st?.tone ?? "neutral"}>
                      {st ? (ko ? st.ko : st.en) : translateBy(ko ? "ko" : "en", "admin_support_unknown_status")}
                    </AdminToneBadge>
                    <span className="text-xs font-bold text-sam-fg">
                      {r.store_name || (translateBy(ko ? "ko" : "en", "admin_support_unnamed_store"))}
                    </span>
                    <span className="text-[12px] text-sam-muted">
                      {type ? translateBy(ko ? "ko" : "en", type) : translateBy(ko ? "ko" : "en", "admin_support_other")}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[12px] text-sam-muted">
                      {formatAdminManilaDateTime(r.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-sam-fg">{r.subject}</p>
                  <p className="text-[12px] text-sam-muted">
                    {r.from_user_label || (translateBy(ko ? "ko" : "en", "admin_support_name_unavailable"))}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination ko={ko} page={page} size={PAGE_SIZE} total={total} onPageChange={setPage} disabled={loading} />
    </section>
  );
}
