"use client";

import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveAdminHttpErrorMessage } from "@/lib/admin/resolve-admin-http-error";
import { logAdminMutation } from "@/lib/admin/admin-perf-logger";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { CommunityListPagination, useCommunityListQuery } from "@/components/admin/community/kit/CommunityAdminKit";
import { TRADE_FLOW_STATUS_NAMESPACE } from "@/lib/admin/status-labels/pr3-trade-status-labels";

interface Row {
  roomId: string;
  postId: string;
  postTitle: string;
  sellerId: string;
  buyerId: string;
  tradeFlowStatus: string;
  sellerCompletedAt: string | null;
  buyerConfirmedAt: string | null;
  buyerConfirmSource: string | null;
  buyerPending: boolean;
  lastMessageAt: string | null;
}

/**
 * 구매자 확인 (거래 운영 `/admin/trade-flow?panel=complete` 탭) — 판매자가 거래완료한 채팅.
 * R7: 서버 페이지(`/api/admin/trade-completion` 본문 limit/offset → total) · URL page/size(20/50/100). `<Suspense>` 안에서 렌더.
 */
export function AdminTradeCompletionPage({ embedded = false }: { embedded?: boolean }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useCommunityListQuery();
  const limit = lq.query.size;
  const offset = (lq.query.page - 1) * lq.query.size;
  const confirmSourceLabel = (v: string | null) =>
    v === "user"
      ? t("admin_trade_confirm_source_user")
      : v === "system"
        ? t("admin_trade_confirm_source_system")
        : v === "admin"
          ? t("admin_trade_confirm_source_admin")
          : v
            ? t("admin_trade_label_unknown")
            : "—";
  const [items, setItems] = useState<Row[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /** 조회 실패 — 직전 목록은 지우지 않는다 */
  const [loadErr, setLoadErr] = useState<{ code: string; httpStatus: number } | null>(null);
  /** 구매자 확인 처리 실패 안내 */
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/trade-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, offset }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; items?: Row[]; total?: number };
      if (!res.ok || data.ok === false) {
        setLoadErr({ code: data.error || `http_${res.status}`, httpStatus: res.status });
        return;
      }
      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      setTotal(typeof data.total === "number" ? data.total : list.length);
    } catch {
      setLoadErr({ code: "network_error", httpStatus: 0 });
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmBuyer = async (roomId: string) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("approve"),
      ko: language !== "en",
      title: t("admin_trade_completion_admin_confirm_question"),
      confirmLabel: t("admin_trade_completion_admin_confirm"),
    });
    if (!confirmed.ok) return;
    const reason = confirmed.reason ?? "";
    setBusyId(roomId);
    setError(null);
    logAdminMutation("trade-completion:confirm-buyer", "start", { roomId });
    try {
      const res = await fetch("/api/admin/trade-flow/confirm-buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        logAdminMutation("trade-completion:confirm-buyer", "fail", { roomId, status: res.status });
        setError(resolveAdminHttpErrorMessage(res, data, t, "admin_trade_completion_process_failed"));
        return;
      }
      logAdminMutation("trade-completion:confirm-buyer", "success", { roomId });
      await load();
    } catch {
      logAdminMutation("trade-completion:confirm-buyer", "fail", { roomId });
      setError(t("common_network_error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <>
          <AdminPageHeader titleKey="admin_page_trade_completion" />
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_page_trade_completion_desc")}
          </p>
        </>
      )}
      {error ? (
        <div role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-3 sam-text-body text-sam-fg">
          {error}
        </div>
      ) : null}
      {loadErr ? (
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />
      ) : null}
      {items === null ? (
        loading ? <AdminLoadingState ko={ko} label={t("common_loading")} /> : null
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="w-full min-w-[960px] border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_chat")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_post")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_flow")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_seller_completed_at")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_buyer_confirmed")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_trade_completion_manage")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.roomId}
                  className={`border-b border-sam-border-soft ${
                    r.buyerPending ? "bg-sam-warning-soft" : "hover:bg-sam-app/80"
                  }`}
                >
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <AdminToneBadge tone="warning">{t("admin_trade_completion_pending_buyer")}</AdminToneBadge>
                    ) : (
                      <span className="text-sam-muted">{t("admin_trade_completion_done")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono sam-text-helper">
                    <Link href={withAdminReturnTo(`/admin/chats/${encodeURIComponent(r.roomId)}`, "/admin/trade-flow?panel=complete")} className="text-signature hover:underline">
                      {formatAdminShortIdEllipsis(r.roomId)}
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.postTitle}>
                    {r.postTitle}
                  </td>
                  <td className="px-3 py-2">
                    <AdminStatusLabel namespace={TRADE_FLOW_STATUS_NAMESPACE} code={r.tradeFlowStatus} ko={language !== "en"} />
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.sellerCompletedAt ? formatAdminDateTime(r.sellerCompletedAt, language) : "—"}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.buyerConfirmedAt
                      ? `${formatAdminDateTime(r.buyerConfirmedAt, language)} (${confirmSourceLabel(r.buyerConfirmSource)})`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busyId === r.roomId}
                        onClick={() => void confirmBuyer(r.roomId)}
                      >
                        {t("admin_trade_completion_admin_confirm")}
                      </AdminActionButton>
                    ) : (
                      <span className="text-sam-meta">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <AdminEmptyState ko={ko} message={t("admin_trade_completion_no_items")} />
          )}
          <div className="border-t border-sam-border-soft px-3 py-2">
            <CommunityListPagination lq={lq} total={total} disabled={loading} />
          </div>
        </div>
      )}
    </div>
  );
}
