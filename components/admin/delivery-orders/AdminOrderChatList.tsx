"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminOrderDetailModal, useAdminOrderDetailParam } from "@/components/admin/store-orders/AdminOrderDetailModal";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import type { AdminStoreOrderChatListRow } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";

/**
 * P1-1 — Delivery order-chat LIVE (lookup-only).
 * Identity = store_orders.community_messenger_room_id. 「주문 채팅 열기」 → /admin/stores/orders/{orderId}/chat
 * (single admin order-chat route, same as order detail — DEF-60/61).
 * Admin entry never creates rooms.
 */
export function AdminOrderChatList() {
  const { t, safeT, language } = useI18n();
  const [rows, setRows] = useState<AdminStoreOrderChatListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
  const modal = useAdminOrderDetailParam();
  const statusLabel = (s: string) => {
    const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
    return key ? t(key) : s;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/order-chats", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rows?: AdminStoreOrderChatListRow[];
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setRows([]);
        setError({ code: res.status === 401 || res.status === 403 ? "forbidden" : json?.error || "load_failed", status: res.status });
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setRows([]);
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="sam-text-body-secondary text-sam-muted" data-admin-surface="live" data-admin-domain="delivery">
        {safeT("admin_do_chat_list_loading", {
          fallbackKo: "불러오는 중…",
          fallbackEn: "Loading…",
        })}
      </p>
    );
  }

  if (error) {
    return (
      <p
        className="rounded-ui-rect border border-sam-danger/40 bg-sam-danger/5 px-3 py-2 text-sm text-sam-danger"
        data-admin-surface="live"
        data-admin-domain="delivery"
      >
        {safeT("admin_do_chat_list_error", {
          fallbackKo: "주문 채팅 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load order chats.",
        })}{" "}
        {adminOperatorErrorMessage(error.code, language !== "en")}
        {error.code !== "forbidden" ? (
          <button type="button" onClick={() => void load()} className="ml-2 font-medium underline">
            {language === "en" ? "Retry" : "다시 시도"}
          </button>
        ) : null}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted"
        data-admin-surface="live"
        data-admin-domain="delivery"
        data-admin-entity="store_order_chat"
        data-testid="admin-order-chat-empty"
      >
        <p>
          {safeT("admin_do_chat_list_empty", {
            fallbackKo: "채팅 없음",
            fallbackEn: "No chats",
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/admin/stores/orders" className="font-medium text-sam-fg underline">
            {t("admin_do_chat_store_orders")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-admin-entity="store_order_chat"
      data-admin-chat-domain="store_order"
      data-testid="admin-order-chat-list-live"
    >
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_order", { fallbackKo: "주문", fallbackEn: "Order" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_store", { fallbackKo: "매장", fallbackEn: "Store" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_customer", { fallbackKo: "고객", fallbackEn: "Customer" })}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_do_chat_col_last", {
                fallbackKo: "최근 메시지",
                fallbackEn: "Last message",
              })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.orderId} className="border-b border-sam-border/70 last:border-0">
              <td className="px-3 py-2.5 align-top">
                <Link
                  href={`/admin/stores/orders/${encodeURIComponent(row.orderId)}/chat`}
                  className="font-medium text-signature underline"
                >
                  {safeT("admin_do_chat_open_room", {
                    fallbackKo: "주문 채팅 열기",
                    fallbackEn: "Open order chat",
                  })}
                </Link>
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => modal.openOrder(row.orderId, "basic")}
                    className="inline-block rounded bg-sam-app px-1.5 py-0.5 font-mono sam-text-xxs text-sam-fg underline"
                    data-open-order={row.orderNo || row.orderId}
                  >
                    {row.orderNo || (language === "en" ? "Open order" : "주문 보기")}
                  </button>
                  <span className="ml-2 sam-text-xxs text-sam-muted">{statusLabel(row.orderStatus)}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-top text-sam-fg">{row.storeLabel}</td>
              <td className="px-3 py-2.5 align-top">
                {row.customerUserId ? (
                  <Link
                    href={`/admin/users/${encodeURIComponent(row.customerUserId)}`}
                    className="text-signature underline"
                  >
                    {row.customerLabel}
                  </Link>
                ) : (
                  <span className="text-sam-muted">-</span>
                )}
              </td>
              <td className="px-3 py-2.5 align-top">
                <div className="line-clamp-2 text-sam-fg">{row.lastMessage}</div>
                <div className="mt-0.5 sam-text-xxs text-sam-muted">
                  {row.lastMessageAt ? formatAdminDateTime(row.lastMessageAt, language) : "-"}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AdminOrderDetailModal orderId={modal.orderId} section={modal.section} onClose={modal.closeOrder} onChanged={() => void load()} />
    </div>
  );
}
