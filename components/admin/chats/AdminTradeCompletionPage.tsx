"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveAdminHttpErrorMessage } from "@/lib/admin/resolve-admin-http-error";
import { logAdminMutation } from "@/lib/admin/admin-perf-logger";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

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

export function AdminTradeCompletionPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveAdminHttpErrorMessage(res, data, t, "admin_trade_completion_fetch_failed"));
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError(t("common_network_error"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmBuyer = async (roomId: string) => {
    if (!(await dibayConfirm({ title: t("admin_trade_completion_admin_confirm_question") }))) return;
    setBusyId(roomId);
    setError(null);
    logAdminMutation("trade-completion:confirm-buyer", "start", { roomId });
    try {
      const res = await fetch("/api/admin/trade-flow/confirm-buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
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
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
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
                    r.buyerPending ? "bg-amber-50/90 hover:bg-amber-50" : "hover:bg-sam-app/80"
                  }`}
                >
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 sam-text-xxs font-semibold text-amber-950">
                        {t("admin_trade_completion_pending_buyer")}
                      </span>
                    ) : (
                      <span className="text-sam-muted">{t("admin_trade_completion_done")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono sam-text-helper">
                    <Link href={tradeChatNotificationHref(r.roomId, "product_chat")} className="text-signature hover:underline" target="_blank">
                      {r.roomId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.postTitle}>
                    {r.postTitle}
                  </td>
                  <td className="px-3 py-2">{r.tradeFlowStatus}</td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.sellerCompletedAt ? new Date(r.sellerCompletedAt).toLocaleString("ko-KR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.buyerConfirmedAt
                      ? `${new Date(r.buyerConfirmedAt).toLocaleString("ko-KR")} (${r.buyerConfirmSource ?? "—"})`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <button
                        type="button"
                        disabled={busyId === r.roomId}
                        onClick={() => void confirmBuyer(r.roomId)}
                        className="rounded border border-sam-border bg-signature/5 px-2 py-1 sam-text-xxs font-medium text-sam-fg hover:bg-signature/10 disabled:opacity-50"
                      >
                        {busyId === r.roomId ? t("admin_chat_processing") : t("admin_trade_completion_admin_confirm")}
                      </button>
                    ) : (
                      <span className="text-sam-meta">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="px-4 py-10 text-center sam-text-body text-sam-muted">{t("admin_trade_completion_no_items")}</p>
          )}
        </div>
      )}
    </div>
  );
}
