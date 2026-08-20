"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import type { AdminStoreOrderChatListRow } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";

/**
 * P1-1 — Delivery order-chat LIVE (lookup-only).
 * Identity = store_orders.community_messenger_room_id → CM store_order detail.
 * Admin entry never creates rooms.
 */
export function AdminOrderChatList() {
  const { t, safeT, language } = useI18n();
  const [rows, setRows] = useState<AdminStoreOrderChatListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/order-chats", { credentials: "include" });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rows?: AdminStoreOrderChatListRow[];
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setRows([]);
        setError(json?.error || "load_failed");
        return;
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch {
      setRows([]);
      setError("load_failed");
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
        })}
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
          <Link href="/admin/store-orders" className="font-medium text-sam-fg underline">
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
                  href={`/admin/chats/messenger/${encodeURIComponent(row.roomId)}`}
                  className="font-medium text-signature underline"
                >
                  {safeT("admin_do_chat_open_room", {
                    fallbackKo: "메신저 방 열기",
                    fallbackEn: "Open messenger room",
                  })}
                </Link>
                <div className="mt-1">
                  <Link
                    href={`/admin/stores/orders/${encodeURIComponent(row.orderId)}`}
                    className="inline-block rounded bg-sam-app px-1.5 py-0.5 font-mono sam-text-xxs text-sam-fg underline"
                  >
                    {row.orderId.slice(0, 8)}…
                  </Link>
                  <span className="ml-2 sam-text-xxs text-sam-muted">{row.orderStatus}</span>
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
    </div>
  );
}
