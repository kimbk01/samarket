"use client";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  from_user_id: string;
  from_user_label?: string | null;
  inquiry_type: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

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

/** 목록 조건 = 주소 (`store_id` 딥링크 · `page` · `size`). 필터 UI 는 없다 (매장 딥링크만). */
const LIST_CONFIG = { extras: ["store_id"] as const };

export function AdminStoreInquiriesPage() {
  return (
    <Suspense fallback={null}>
      <AdminStoreInquiriesPageInner />
    </Suspense>
  );
}

function AdminStoreInquiriesPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery(LIST_CONFIG);
  const storeIdFilter = lq.query.extras.store_id.trim();
  const apiQs = lq.apiQueryString;
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/store-inquiries?${apiQs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5). 잘못된 매장 ID(400)는 오류 맵 문구로.
        setLoadError({ code: res.status === 403 ? "forbidden" : json?.error === "invalid_store_id" ? "invalid_store_id" : "load_failed", status: res.status });
        return;
      }
      setRows(json.inquiries ?? []);
      setTotal(Number(json.total) || 0);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [apiQs]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [lq.refreshKey]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title={ko ? "매장 문의" : "Store inquiries"} />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_inquiries_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          {ko ? "특정 매장 문의만 보는 중" : "Filtered to one store"}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {ko ? "매장 상세로" : "Back to store"}
          </Link>
          {" · "}
          <Link href="/admin/store-inquiries" className="text-signature hover:underline">
            {ko ? "전체 문의 보기" : "Show all inquiries"}
          </Link>
        </p>
      ) : null}

      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={lq.refresh} />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState ko={ko} message={t("admin_stores_inquiries_empty")} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = STATUS_LABELS[r.status];
            const type = TYPE_LABELS[r.inquiry_type];
            return (
              <article
                key={r.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap justify-between gap-2 sam-text-body-secondary">
                  <span className="font-semibold text-sam-fg">
                    {r.store_id ? (
                      <Link href={businessCcBackToStoreHref(r.store_id)} className="hover:text-signature hover:underline">
                        {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                      </Link>
                    ) : (
                      r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")
                    )}
                  </span>
                  <AdminToneBadge tone={st?.tone ?? "neutral"}>
                    {st ? (ko ? st.ko : st.en) : ko ? "알 수 없는 상태" : "Unknown status"}
                  </AdminToneBadge>
                </div>
                <p className="mt-1 text-xs text-sam-muted">
                  {type ? (ko ? type[0] : type[1]) : ko ? "기타 문의" : "Other"} ·{" "}
                  {ko ? "문의자" : "From"}: {r.from_user_label || (ko ? "이름 확인 불가" : "Name unavailable")} ·{" "}
                  {formatAdminManilaDateTime(r.created_at)}
                </p>
                <p className="mt-2 font-medium text-sam-fg">{r.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
                {r.answer ? (
                  <div className="mt-3 rounded-ui-rect bg-sam-app p-3 text-sm text-sam-fg">
                    <p className="text-xs font-medium text-sam-muted">{t("admin_stores_inquiries_store_reply")}</p>
                    <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                    {r.answered_at ? (
                      <p className="mt-1 sam-text-xxs text-sam-meta">
                        {formatAdminManilaDateTime(r.answered_at)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <AdminTechDetails ko={ko}>
                  <div>inquiry_id: {r.id}</div>
                  <div>store_id: {r.store_id}</div>
                  <div>from_user_id: {r.from_user_id}</div>
                  <div>status: {r.status}</div>
                </AdminTechDetails>
              </article>
            );
          })}
        </div>
      )}
      {rows.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      ) : null}
    </div>
  );
}
