"use client";

/**
 * DEF-60 — Admin 주문 채팅 단일 경로 `/admin/stores/orders/{orderId}/chat`.
 * Data: GET /api/admin/order-chats/{orderId} (lookup-only — no room create / join / read marker).
 * 채팅 Admin 설계 §2-3: 배달 담당(`business`)이 채팅 Admin 없이 같은 시트(S2 방 조치·S3 메시지 숨김)와
 * 신고 큐(이 방 대상)로 처리한다 — 서버가 방 유형 권한(`chats`|`business`)을 판정.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import type {
  AdminStoreOrderChatMessage,
  AdminStoreOrderChatSenderRole,
  AdminStoreOrderChatView,
} from "@/lib/admin-delivery-orders/load-admin-store-order-chat";
import { AdminCmMessageBody, AdminCmMessageKindBadge } from "@/components/admin/chats/AdminCmMessageBody";
import { useAdminOlderMessages } from "@/components/admin/chats/use-admin-older-messages";
import { adminCmRoomDetailHref } from "@/lib/admin-community-messenger/room-domain-links";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import {
  AdminChatMessageHideSheet,
  AdminChatRoomActionSheet,
  adminChatRoomActionIsDestructive,
  type AdminChatRoomAction,
} from "@/components/admin/chats/AdminChatSheets";
import type { AdminChatSheetSettle } from "@/components/admin/chats/AdminChatActionSheet";
import { ADMIN_CHAT_REPORT_QUEUE_PATH } from "@/lib/admin/chat-admin/admin-chat-links";

const ROOM_ACTION_LABEL: Record<AdminChatRoomAction, MessageKey> = {
  block_room: "admin_cm_action_block_chat",
  unblock_room: "admin_cm_action_unblock_chat",
  archive_room: "admin_cm_action_archive",
  unarchive_room: "admin_cm_action_unarchive",
  readonly_on: "admin_cm_action_readonly_on",
  readonly_off: "admin_cm_action_readonly_off",
};

const ROLE_KEY: Record<AdminStoreOrderChatSenderRole, MessageKey> = {
  buyer: "admin_r4b_chat_role_buyer",
  store: "admin_r4b_chat_role_store",
  system: "admin_r4b_chat_role_system",
  other: "admin_r4b_chat_role_other",
};

const ROLE_BUBBLE: Record<AdminStoreOrderChatSenderRole, string> = {
  buyer: "mr-auto border-sam-border bg-sam-surface",
  store: "ml-auto border-sam-primary-soft bg-sam-primary-soft",
  system: "mx-auto border-sam-border-soft bg-sam-surface-muted text-center",
  other: "mr-auto border-sam-border bg-sam-surface",
};

export function AdminStoreOrderChatViewer({ orderId }: { orderId: string }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const backHref = readAdminReturnToFromSearch(searchParams) ?? "/admin/order-chats";
  const [chat, setChat] = useState<AdminStoreOrderChatView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
  const [sheet, setSheet] = useState<
    { kind: "room"; action: AdminChatRoomAction } | { kind: "message"; message: AdminStoreOrderChatMessage } | null
  >(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/order-chats/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; chat?: AdminStoreOrderChatView } | null;
      if (!res.ok || !j?.ok || !j.chat) {
        setError({ code: res.status === 403 ? "forbidden" : j?.error || "load_failed", status: res.status });
        return;
      }
      setChat(j.chat);
    } catch {
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // R1-B C-6: 최신 페이지 먼저 + id 커서 「이전 메시지 더 보기」
  const fetchOlder = useCallback(
    async (beforeId: string) => {
      const res = await fetch(
        `/api/admin/order-chats/${encodeURIComponent(orderId)}?before=${encodeURIComponent(beforeId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; chat?: AdminStoreOrderChatView } | null;
      if (!res.ok || !j?.ok || !j.chat) throw new Error(j?.error || "load_failed");
      return { items: j.chat.messages, hasMore: j.chat.hasMore === true };
    },
    [orderId]
  );
  const older = useAdminOlderMessages<AdminStoreOrderChatMessage>({
    resetKey: `${orderId}:${chat?.roomId ?? ""}`,
    latest: chat?.messages ?? [],
    latestHasMore: chat?.hasMore === true,
    fetchOlder,
  });
  /** 이 화면(returnTo 포함) — 통합 채팅 상세에서 돌아올 경로 */
  const hereHref = withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(orderId)}/chat`, backHref);

  const statusLabel = (s: string) => {
    const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
    return key ? t(key) : "—";
  };
  const orderHref = withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(orderId)}`, hereHref);
  const onSettled = (kind: AdminChatSheetSettle) => {
    setSheet(null);
    setResult({
      ok: true,
      message: t(kind === "done" ? "admin_chat_sheet_done" : kind === "stale" ? "admin_chat_sheet_stale" : "admin_chat_sheet_gone"),
    });
    void load();
  };

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-admin-chat-domain="store_order"
      data-testid="admin-order-chat-viewer"
    >
      <AdminPageHeader titleKey="admin_menu_order_chats" description={t("admin_r4b_chat_desc")} backHref={backHref} />
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {loading && !chat ? (
        <AdminLoadingState ko={ko} />
      ) : error && !chat ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} />
      ) : chat ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <dl className="grid gap-2 sam-text-helper sm:grid-cols-3">
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_status")}</dt>
                <dd className="font-medium text-sam-fg">
                  <span className="font-mono">{chat.orderNo || "—"}</span> · {statusLabel(chat.orderStatus)}
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_store")}</dt>
                <dd className="text-sam-fg">{chat.storeName}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_r4b_chat_buyer")}</dt>
                <dd className="text-sam-fg">{chat.buyerLabel}</dd>
              </div>
              {chat.roomId ? (
                <div>
                  <dt className="text-sam-muted">{t("admin_chat_r1b_room_status")}</dt>
                  <dd className="text-sam-fg" data-admin-room-status={chat.roomStatus ?? ""}>
                    {chat.roomStatus === "blocked"
                      ? t("admin_chat_r1b_status_blocked")
                      : chat.roomStatus === "archived"
                        ? t("admin_chat_r1b_status_archived")
                        : t("admin_chat_r1b_status_active")}
                  </dd>
                </div>
              ) : null}
              {chat.roomId ? (
                <div>
                  <dt className="text-sam-muted">{t("admin_chat_r1b_readonly")}</dt>
                  <dd className="text-sam-fg">{chat.isReadonly ? t("admin_chat_r1b_on") : t("admin_chat_r1b_off")}</dd>
                </div>
              ) : null}
            </dl>
            {chat.roomId && chat.roomSource && chat.roomSource !== "linked" ? (
              <p className="mt-2 sam-text-helper text-amber-800" data-admin-room-source={chat.roomSource}>
                {t("admin_chat_r1b_room_fallback")}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={orderHref} className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-fg hover:bg-sam-surface-muted">
                {t("admin_r4b_chat_order_detail")}
              </Link>
              {chat.roomId ? (
                <Link
                  href={adminCmRoomDetailHref(chat.roomId, hereHref)}
                  className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper text-sam-fg hover:bg-sam-surface-muted"
                >
                  {t("admin_chat_r1b_open_unified")}
                </Link>
              ) : null}
              {chat.roomId ? (
                <AdminActionLink
                  href={withAdminReturnTo(
                    `${ADMIN_CHAT_REPORT_QUEUE_PATH}?status=all&target=${encodeURIComponent(chat.roomId)}`,
                    hereHref
                  )}
                  variant="secondary"
                >
                  {t("admin_chat_room_reports_link")}
                </AdminActionLink>
              ) : null}
              <AdminActionButton onClick={() => void load()} disabled={loading}>
                {t("admin_r4b_chat_reload")}
              </AdminActionButton>
            </div>
            {chat.roomId ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-sam-border-soft pt-3" data-admin-chat-room-actions>
                {(
                  [
                    chat.roomStatus !== "blocked" ? "block_room" : "unblock_room",
                    chat.roomStatus !== "archived" ? "archive_room" : "unarchive_room",
                    !chat.isReadonly ? "readonly_on" : "readonly_off",
                  ] as AdminChatRoomAction[]
                ).map((action) => (
                  <AdminActionButton
                    key={action}
                    variant={adminChatRoomActionIsDestructive(action) ? "danger" : "secondary"}
                    disabled={sheet !== null}
                    onClick={() => setSheet({ kind: "room", action })}
                  >
                    {t(ROOM_ACTION_LABEL[action])}
                  </AdminActionButton>
                ))}
              </div>
            ) : null}
            <AdminTechDetails ko={ko}>
              orderId={chat.orderId}
              {chat.roomId ? ` · roomId=${chat.roomId}` : ""}
            </AdminTechDetails>
          </section>

          {error ? <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} /> : null}

          <section className="rounded-ui-rect border border-sam-border bg-sam-app p-3" aria-label={t("admin_r4b_chat_messages")}>
            {!chat.roomId ? (
              <AdminEmptyState ko={ko} message={t("admin_r4b_chat_no_room")} />
            ) : older.messages.length === 0 ? (
              <AdminEmptyState ko={ko} message={t("admin_r4b_chat_empty")} />
            ) : (
              <>
                {older.hasMore ? (
                  <div className="mb-2 flex flex-col items-center gap-1">
                    <AdminActionButton disabled={older.loading} onClick={() => void older.loadOlder()}>
                      {older.loading ? t("admin_chat_r1b_loading_older") : t("admin_chat_r1b_load_older")}
                    </AdminActionButton>
                    {older.error ? <p className="sam-text-xxs text-red-700">{t("admin_chat_r1b_load_older_failed")}</p> : null}
                  </div>
                ) : null}
                <ol className="flex flex-col gap-2">
                  {older.messages.map((m) => (
                    <li
                      key={m.id}
                      data-chat-sender-role={m.senderRole}
                      className={`max-w-[85%] rounded-ui-rect border px-3 py-2 sam-text-helper ${ROLE_BUBBLE[m.senderRole]}`}
                    >
                      <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 sam-text-xxs text-sam-muted">
                        <span className="font-medium">
                          {t(ROLE_KEY[m.senderRole])}
                          {m.senderLabel && m.senderRole !== "system" ? ` · ${m.senderLabel}` : ""}
                        </span>
                        <span className="tabular-nums">{m.createdAt ? formatAdminDateTime(m.createdAt, language) : ""}</span>
                        {m.display ? <AdminCmMessageKindBadge kind={m.display.kind} /> : null}
                      </div>
                      {m.hiddenByAdmin ? (
                        <p className="italic text-sam-muted">{t("admin_r4b_chat_hidden")}</p>
                      ) : (
                        <AdminCmMessageBody display={m.display} fallbackText={m.content} />
                      )}
                      {m.senderRole !== "system" ? (
                        <button
                          type="button"
                          disabled={sheet !== null}
                          onClick={() => setSheet({ kind: "message", message: m })}
                          className="mt-1 sam-text-xxs font-medium text-sam-muted underline disabled:opacity-50"
                        >
                          {m.hiddenByAdmin ? t("admin_cm_action_unhide_message") : t("admin_cm_action_hide_message")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
          {sheet?.kind === "room" && chat.roomId ? (
            <AdminChatRoomActionSheet
              roomId={chat.roomId}
              roomLabel={`${chat.orderNo || chat.orderId} · ${chat.storeName}`}
              currentStatus={chat.roomStatus ?? "active"}
              isReadonly={chat.isReadonly === true}
              action={sheet.action}
              onClose={() => setSheet(null)}
              onSettled={onSettled}
            />
          ) : null}
          {sheet?.kind === "message" && chat.roomId ? (
            <AdminChatMessageHideSheet
              roomId={chat.roomId}
              messageId={sheet.message.id}
              senderLabel={sheet.message.senderLabel}
              createdAt={sheet.message.createdAt}
              preview={sheet.message.display?.text || sheet.message.content}
              hidden={!sheet.message.hiddenByAdmin}
              onClose={() => setSheet(null)}
              onSettled={onSettled}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
