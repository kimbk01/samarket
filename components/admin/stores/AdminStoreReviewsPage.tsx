"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  buyer_user_id: string;
  buyer_label?: string | null;
  rating: number;
  content: string;
  status: string;
  created_at: string;
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
};

/** 목록 조건 = 주소 (`store_id` 딥링크 · `page` · `size`). 필터 UI 는 없다 (매장 딥링크만). */
const LIST_CONFIG = { extras: ["store_id"] as const };

export function AdminStoreReviewsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery(LIST_CONFIG);
  const storeIdFilter = lq.query.extras.store_id.trim();
  const apiQs = lq.apiQueryString;
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/store-reviews?${apiQs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadError({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        return;
      }
      setRows(json.reviews ?? []);
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

  /** 숨김 = L2 (사유), 복구 = L1. 실패는 결과 배너로 표시 (DEF-44). */
  async function setStatus(id: string, status: "visible" | "hidden") {
    const hiding = status === "hidden";
    const confirmed = await confirmAdminAction({
      level: hiding ? "L2" : "L1",
      ko,
      title: hiding
        ? ko
          ? "이 리뷰를 숨길까요?"
          : "Hide this review?"
        : ko
          ? "이 리뷰를 다시 보이게 할까요?"
          : "Restore this review?",
      description: hiding
        ? ko
          ? "고객 앱 매장 리뷰 목록에서 보이지 않습니다."
          : "It will no longer appear in the store's reviews."
        : undefined,
      confirmLabel: hiding ? (ko ? "숨김" : "Hide") : ko ? "복구" : "Restore",
      destructive: hiding,
    });
    if (!confirmed.ok) return;
    setBusyId(id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/store-reviews/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmed.reason ? { status, reason: confirmed.reason } : { status }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        const code =
          res.status === 409
            ? "status_changed"
            : res.status === 403
              ? "forbidden"
              : json?.error === "reason_required"
                ? "reason_required"
                : "action_failed";
        setResult({ ok: false, code });
        if (code === "status_changed") await load();
        return;
      }
      setResult({
        ok: true,
        message: hiding
          ? ko
            ? "리뷰를 숨겼습니다."
            : "Review hidden."
          : ko
            ? "리뷰를 다시 보이게 했습니다."
            : "Review restored.",
      });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title={ko ? "매장 리뷰" : "Store reviews"} />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_reviews_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          {ko ? "특정 매장 리뷰만 보는 중" : "Filtered to one store"}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {ko ? "매장 상세로" : "Back to store"}
          </Link>
          {" · "}
          <Link href="/admin/store-reviews" className="text-signature hover:underline">
            {ko ? "전체 리뷰 보기" : "Show all reviews"}
          </Link>
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={lq.refresh} />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState ko={ko} message={t("admin_stores_reviews_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          {/* 표준 표 (§2.8 목록) — 열: 매장·상태·작성·평점·리뷰·사장님 답글·처리 */}
          <table className="w-full min-w-[60rem] border-collapse text-left sam-text-body-secondary" data-admin-store-reviews-table="1">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{ko ? "매장" : "Store"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "작성일·작성자" : "Date / buyer"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "평점" : "Rating"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "리뷰" : "Review"}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_stores_reviews_owner_reply")}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "처리" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = adminStatusLabel("review", r.status, ko);
                return (
                  <tr key={r.id} className="border-b border-sam-border/70 align-top">
                    <td className="py-2 pr-2 font-medium text-sam-fg">
                      {r.store_id ? (
                        <Link href={businessCcBackToStoreHref(r.store_id)} className="hover:text-signature hover:underline">
                          {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                        </Link>
                      ) : (
                        r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")
                      )}
                      <AdminTechDetails ko={ko}>
                        <div>review_id: {r.id}</div>
                        <div>store_id: {r.store_id}</div>
                        <div>order_id: {r.order_id}</div>
                        <div>buyer_user_id: {r.buyer_user_id}</div>
                        <div>status: {r.status}</div>
                      </AdminTechDetails>
                    </td>
                    <td className="py-2 pr-2">
                      <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-[12px] text-sam-muted">
                      <div>{formatAdminManilaDate(r.created_at)}</div>
                      <div>{r.buyer_label || (ko ? "이름 확인 불가" : "Name unavailable")}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-sam-warning">{"★".repeat(r.rating)}</td>
                    <td className="max-w-[20rem] py-2 pr-2">
                      <p className="whitespace-pre-wrap text-sam-fg">{r.content}</p>
                    </td>
                    <td className="max-w-[16rem] py-2 pr-2">
                      {r.owner_reply_content?.trim() ? (
                        <>
                          <p className="whitespace-pre-wrap text-sam-fg">{r.owner_reply_content}</p>
                          {r.owner_reply_created_at ? (
                            <p className="mt-1 sam-text-xxs text-sam-muted">
                              {formatAdminManilaDate(r.owner_reply_created_at)}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="sam-text-helper text-sam-meta">{t("admin_stores_reviews_no_owner_reply")}</p>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {/* 변경 CTA — 텍스트 링크형이 아닌 표준 버튼 + confirmAdminAction (숨김 L2 · 복구 L1) */}
                      {r.status === "visible" ? (
                        <AdminActionButton variant="secondary" size="sm" disabled={busyId !== null} onClick={() => void setStatus(r.id, "hidden")}>
                          {ko ? "숨김" : "Hide"}
                        </AdminActionButton>
                      ) : (
                        <AdminActionButton variant="secondary" size="sm" disabled={busyId !== null} onClick={() => void setStatus(r.id, "visible")}>
                          {ko ? "복구" : "Restore"}
                        </AdminActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
