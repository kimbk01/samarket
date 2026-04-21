"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminChatRoom } from "@/lib/types/admin-chat";
import { AdminChatRoomStatusBadge } from "./AdminChatRoomStatusBadge";

interface AdminChatTableProps {
  rooms: AdminChatRoom[];
  selectedIds: ReadonlySet<string>;
  onToggleRow: (roomId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
}

export function AdminChatTable({
  rooms,
  selectedIds,
  onToggleRow,
  onToggleAllVisible,
}: AdminChatTableProps) {
  const { t } = useI18n();
  const visibleIds = rooms.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) {
      el.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[760px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="w-10 px-2 py-2.5 text-center font-medium text-sam-fg">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => onToggleAllVisible(e.target.checked)}
                className="rounded border-sam-border"
                title={t("admin_chat_select_all_visible")}
                aria-label={t("admin_chat_select_all_visible")}
              />
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_room_id")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_product_title")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_seller")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_buyer")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_last_message")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_last_time")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_chat_unread")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_chat_room_status")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_chat_report")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_chat_block")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_chat_detail_link")}</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-2 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={(e) => onToggleRow(r.id, e.target.checked)}
                  className="rounded border-sam-border"
                  aria-label={t("admin_chat_select_row", { id: r.id.slice(0, 8) })}
                />
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 font-mono sam-text-helper text-sam-muted">
                {r.id.slice(0, 8)}…
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg">
                {r.productTitle}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg" title={r.sellerId}>
                {r.sellerNickname}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg" title={r.buyerId}>
                {r.buyerNickname}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-sam-muted">
                {r.lastMessage || "-"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(r.lastMessageAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary text-sam-muted">
                {(r.unreadSeller ?? 0) + (r.unreadBuyer ?? 0) > 0
                  ? `판${r.unreadSeller ?? 0}/구${r.unreadBuyer ?? 0}`
                  : "-"}
              </td>
              <td className="px-3 py-2.5">
                <AdminChatRoomStatusBadge status={r.roomStatus} />
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.reportCount > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Y</span>
                ) : (
                  <span className="text-sam-meta">N</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.roomStatus === "blocked" ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Y</span>
                ) : (
                  <span className="text-sam-meta">N</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={`/admin/chats/${r.id}`}
                  className="sam-text-body-secondary font-medium text-signature hover:underline"
                >
                  {t("admin_chat_detail_link")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
