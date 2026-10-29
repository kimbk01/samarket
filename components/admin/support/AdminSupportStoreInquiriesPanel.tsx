"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { adminListOffsetForPage } from "@/lib/admin/pagination/parse-admin-list-page";

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
  open: { ko: "미답변", en: "Unanswered", tone: "waiting" },
  answered: { ko: "답변 완료", en: "Answered", tone: "success" },
  closed: { ko: "종료", en: "Closed", tone: "neutral" },
  escalated: { ko: "운영팀 이관", en: "Escalated", tone: "warning" },
};

const TYPE_LABELS: Record<string, [string, string]> = {
  product: ["상품 문의", "Product"],
  order: ["주문 문의", "Order"],
  store: ["매장 문의", "Store"],
  complaint: ["불만 접수", "Complaint"],
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
      aria-label={ko ? "매장 문의 (조회 전용)" : "Store inquiries (view only)"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sam-muted">
          {ko
            ? "고객이 매장에 보낸 문의입니다. 답변은 매장 사장님이 하며, 관리자는 조회만 합니다. 고객지원 상담과는 별도 원장입니다."
            : "Inquiries customers sent to stores. Store owners answer them; admins can only view. Separate from support cases."}
        </p>
        <Link href="/admin/store-inquiries" className="text-xs font-semibold text-sam-fg underline">
          {ko ? "매장 문의 전체 화면" : "Open store inquiries"}
        </Link>
      </div>
      <div className="text-xs font-semibold text-sam-muted">
        {ko ? "매장 문의" : "Store inquiries"} · {formatAdminNumber(total)}
        {ko ? "건" : ""}
      </div>

      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load(page)} />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState ko={ko} message={ko ? "매장 문의가 없습니다" : "No store inquiries"} />
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
                      {st ? (ko ? st.ko : st.en) : ko ? "알 수 없는 상태" : "Unknown status"}
                    </AdminToneBadge>
                    <span className="text-xs font-bold text-sam-fg">
                      {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                    </span>
                    <span className="text-[12px] text-sam-muted">
                      {type ? (ko ? type[0] : type[1]) : ko ? "기타 문의" : "Other"}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[12px] text-sam-muted">
                      {formatAdminManilaDateTime(r.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-sam-fg">{r.subject}</p>
                  <p className="text-[12px] text-sam-muted">
                    {r.from_user_label || (ko ? "이름 확인 불가" : "Name unavailable")}
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
