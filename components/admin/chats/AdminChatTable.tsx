"use client";

import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import type { AdminChatRoom } from "@/lib/types/admin-chat";
import { AdminChatRoomStatusBadge } from "./AdminChatRoomStatusBadge";
import { adminCmRoomDetailHref } from "@/lib/admin-community-messenger/room-domain-links";
import { useAdminLocationReturnTo } from "./use-admin-location-return-to";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

interface AdminChatTableProps {
  rooms: AdminChatRoom[];
  selectedIds: ReadonlySet<string>;
  focusedRoomId?: string | null;
  onToggleRow: (roomId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
  /** 목록 URL (검색·필터·페이지 포함) — 상세 링크 `returnTo`. 없으면 현재 위치. */
  returnTo?: string | null;
}

export function AdminChatTable({
  rooms,
  selectedIds,
  focusedRoomId = null,
  onToggleRow,
  onToggleAllVisible,
  returnTo = null,
}: AdminChatTableProps) {
  const { t, safeT, language } = useI18n();
  const visibleIds = rooms.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  const { here: locationHere } = useAdminLocationReturnTo();
  const here = returnTo ?? locationHere;

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
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {safeT("admin_chat_app_room_th", {
                fallbackKo: "앱 채팅방",
                fallbackEn: "App room",
              })}
            </th>
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
            <tr
              key={r.id}
              data-focused-room={focusedRoomId === r.id ? "1" : undefined}
              className={`border-b border-sam-border-soft hover:bg-sam-app ${
                focusedRoomId === r.id ? "bg-signature/10 ring-1 ring-inset ring-signature/40" : ""
              }`}
            >
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
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-xxs text-sam-muted">
                {/* C-10: 저장소 원시 이름(product_chats·chat_rooms)은 운영 화면에 노출하지 않는다. */}
                {/* R1-B C-1: 사용자 앱 채팅방(CM) 연결 */}
                {r.messengerRoomId ? (
                  <Link
                    href={adminCmRoomDetailHref(r.messengerRoomId, here)}
                    className="mt-0.5 block font-medium text-signature hover:underline"
                    title={r.messengerRoomId}
                  >
                    {t("admin_chat_r1b_open_unified")}
                  </Link>
                ) : r.messengerRoomId === null ? (
                  <span className="mt-0.5 block text-amber-800">{t("admin_chat_r1b_legacy_only")}</span>
                ) : null}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg">
                {r.productId ? (
                  <Link
                    href={`/admin/products/${encodeURIComponent(r.productId)}`}
                    className="text-signature hover:underline"
                  >
                    {r.productTitle || r.productId}
                  </Link>
                ) : (
                  r.productTitle
                )}
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
                {formatAdminDateTime(r.lastMessageAt, language)}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary text-sam-muted">
                {(r.unreadSeller ?? 0) + (r.unreadBuyer ?? 0) > 0
                  ? t("admin_chat_unread_seller_buyer", {
                      seller: r.unreadSeller ?? 0,
                      buyer: r.unreadBuyer ?? 0,
                    })
                  : "-"}
              </td>
              <td className="px-3 py-2.5">
                <AdminChatRoomStatusBadge status={r.roomStatus} />
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.reportCount > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    {t("admin_chat_table_report_count", { count: r.reportCount })}
                  </span>
                ) : (
                  <span className="text-sam-meta">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.roomStatus === "blocked" ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                    {adminChatLabel("room_status", "blocked", language !== "en").label}
                  </span>
                ) : (
                  <span className="text-sam-meta">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={withAdminReturnTo(`/admin/chats/${encodeURIComponent(r.id)}`, here)}
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
