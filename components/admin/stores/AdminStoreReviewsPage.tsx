"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
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

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  buyer_user_id: string;
  rating: number;
  content: string;
  status: string;
  created_at: string;
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
};

export function AdminStoreReviewsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );

  const locale = catalogDateLocale(language);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = storeIdFilter
        ? `?store_id=${encodeURIComponent(storeIdFilter)}`
        : "";
      const res = await fetch(`/api/admin/store-reviews${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setLoadError({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        setRows([]);
        return;
      }
      setRows(json.reviews ?? []);
    } catch {
      setLoadError({ code: "network_error" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
        setResult({ ok: false, code: res.status === 403 ? "forbidden" : "action_failed" });
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
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_stores_reviews_empty")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const st = adminStatusLabel("review", r.status, ko);
            return (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-sam-fg">
                  {r.store_id ? (
                    <Link href={businessCcBackToStoreHref(r.store_id)} className="hover:text-signature hover:underline">
                      {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                    </Link>
                  ) : (
                    r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")
                  )}
                </span>
                <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
              </div>
              <p className="mt-1 text-xs text-sam-muted">
                {new Date(r.created_at).toLocaleDateString(locale)}
              </p>
              <p className="mt-2 text-amber-800">{"★".repeat(r.rating)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              {r.owner_reply_content?.trim() ? (
                <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app p-2">
                  <p className="sam-text-helper font-semibold text-sam-fg">
                    {t("admin_stores_reviews_owner_reply")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap sam-text-body-secondary text-sam-fg">
                    {r.owner_reply_content}
                  </p>
                  {r.owner_reply_created_at ? (
                    <p className="mt-1 text-right sam-text-xxs text-sam-muted">
                      {new Date(r.owner_reply_created_at).toLocaleDateString(locale)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 sam-text-helper text-sam-meta">{t("admin_stores_reviews_no_owner_reply")}</p>
              )}
              <div className="mt-3 flex gap-2">
                {r.status === "visible" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "hidden")}
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs"
                  >
                    {ko ? "숨김" : "Hide"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "visible")}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 text-xs text-white"
                  >
                    {ko ? "복구" : "Restore"}
                  </button>
                )}
              </div>
              <AdminTechDetails ko={ko}>
                <div>review_id: {r.id}</div>
                <div>store_id: {r.store_id}</div>
                <div>order_id: {r.order_id}</div>
                <div>buyer_user_id: {r.buyer_user_id}</div>
                <div>status: {r.status}</div>
              </AdminTechDetails>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
