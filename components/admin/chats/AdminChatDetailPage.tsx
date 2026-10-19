"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useCallback, useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  AdminChatRoom,
  AdminChatMessage,
  AdminChatMessageType,
  ChatModerationLog,
} from "@/lib/types/admin-chat";
import {
  getAdminChatRoomByIdFromDb,
  getReportsByRoomIdFromDb,
  type RoomReportRow,
} from "@/lib/admin-chats/getAdminChatRoomsFromDb";
import { getAdminMessagesFromDb } from "@/lib/admin-chats/getAdminMessagesFromDb";
import { getSanctionsByUserIdsFromDb, type SanctionRow } from "@/lib/admin-reports/getSanctionsByUserIdsFromDb";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminErrorState, AdminForbiddenState } from "@/components/admin/ui/AdminStateViews";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { ADMIN_CHAT_REPORT_QUEUE_PATH, adminUserDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { AdminChatRoomStatusBadge } from "./AdminChatRoomStatusBadge";
import { AdminChatMessageTimeline } from "./AdminChatMessageTimeline";
import { AdminChatActionPanel } from "./AdminChatActionPanel";
import { AdminChatModerationLogList } from "./AdminChatModerationLogList";
import type { AdminCmMessageDisplay } from "@/lib/admin-community-messenger/admin-message-display";
import type { AdminTradeMessengerInfo } from "@/lib/admin-chats/trade-messenger-admin-view";
import { adminCmRoomDetailHref } from "@/lib/admin-community-messenger/room-domain-links";
import { confirmAdminAction, ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/operator-ux/admin-confirm-action";
import { useAdminOlderMessages } from "./use-admin-older-messages";
import { useAdminLocationReturnTo } from "./use-admin-location-return-to";

type TradeApiMessage = {
  id: string;
  sender_id: string | null;
  sender_label?: string;
  message_type?: string;
  body?: string;
  created_at?: string;
  is_hidden_by_admin?: boolean;
  report_count?: number;
  display?: AdminCmMessageDisplay;
};

/** R1-B C-1: 레거시 응답·CM 오버레이 메시지 공용 매핑 */
function mapTradeApiMessage(m: TradeApiMessage, roomId: string): AdminChatMessage {
  return {
    id: m.id,
    roomId,
    senderId: m.sender_id ?? "",
    senderNickname: m.sender_label || (m.sender_id ?? "").slice(0, 8),
    messageType: (m.message_type === "image" || m.message_type === "system" ? m.message_type : "text") as AdminChatMessageType,
    message: m.body ?? "",
    createdAt: m.created_at ?? "",
    isHidden: m.is_hidden_by_admin ?? false,
    isReported: (m.report_count ?? 0) > 0,
    ...(m.display ? { display: m.display } : {}),
  };
}

/** CM 메시지 페이지 API 항목 → 레거시 응답 모양 */
function mapCmPageItemToTradeApi(m: {
  id: string;
  senderId: string | null;
  senderLabel: string;
  messageType: string;
  content: string;
  createdAt: string;
  isHiddenByAdmin: boolean;
  reportCount: number;
  display: AdminCmMessageDisplay;
}): TradeApiMessage {
  return {
    id: m.id,
    sender_id: m.senderId,
    sender_label: m.senderLabel,
    message_type: m.messageType,
    body: m.content,
    created_at: m.createdAt,
    is_hidden_by_admin: m.isHiddenByAdmin,
    report_count: m.reportCount,
    display: m.display,
  };
}

/** chat_rooms 기반 관리자 상세 API 응답 → AdminChatRoom + AdminChatMessage[] 로 변환 */
async function fetchAdminChatDetailFromApi(
  roomId: string
): Promise<{
  room: AdminChatRoom;
  messages: AdminChatMessage[];
  reports: RoomReportRow[];
  moderationLogs: ChatModerationLog[];
  adminMemo: string;
  messenger: AdminTradeMessengerInfo | null;
  messagesHasMore: boolean;
} | null> {
  const res = await fetch(`/api/admin/chat/rooms/${roomId}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
  // R1-A: 권한 없음(403)은 클라이언트 DB 폴백으로 우회하지 않는다.
  if (res.status === 403) throw Object.assign(new Error("forbidden"), { adminForbidden: true });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.room) return null;
  const r = data.room as {
    id: string;
    room_type?: string;
    meeting_id?: string;
    item_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
    initiator_id?: string | null;
    peer_id?: string | null;
    last_message_preview?: string | null;
    last_message_at?: string | null;
    created_at: string;
  };
  const rt = r.room_type ?? "";
  const adminRt =
    rt === "item_trade"
      ? "item_trade"
      : rt === "general_chat"
        ? "general_chat"
        : rt === "community"
          ? "community"
          : rt === "group"
            ? "group"
            : rt === "meeting_open_chat"
              ? "meeting_open_chat"
              : rt === "business"
                ? "business"
                : undefined;
  const meetingId = (r.meeting_id ?? "").trim();
  const productId =
    r.item_id ?? (rt === "meeting_open_chat" && meetingId ? meetingId : "");
  const room: AdminChatRoom = {
    id: r.id,
    productId,
    productTitle: data.productTitle ?? "",
    productThumbnail: data.productThumbnail ?? "",
    buyerId: r.buyer_id ?? r.peer_id ?? "",
    buyerNickname: data.buyerNickname ?? (r.peer_id ?? r.buyer_id ?? "").slice(0, 8),
    sellerId: r.seller_id ?? r.initiator_id ?? "",
    sellerNickname: data.sellerNickname ?? (r.initiator_id ?? r.seller_id ?? "").slice(0, 8),
    lastMessage: r.last_message_preview ?? "",
    lastMessageAt: r.last_message_at ?? r.created_at,
    messageCount: data.messageCount ?? 0,
    reportCount: data.reportCount ?? 0,
    roomStatus: (data.roomStatus ?? "active") as AdminChatRoom["roomStatus"],
    createdAt: r.created_at,
    roomType: adminRt,
    contextType: (r as { context_type?: string | null }).context_type ?? undefined,
    isReadonly: (r as { is_readonly?: boolean }).is_readonly === true,
    ...(rt === "meeting_open_chat"
      ? { adminChatStorage: "meeting_open_chat" as const, meetingId }
      : {}),
  };
  const messenger = (data.messenger ?? null) as AdminTradeMessengerInfo | null;
  if (messenger && !messenger.legacyOnly) {
    // R1-B C-1: 사용자 방(CM) 상태가 기준
    room.isReadonly = messenger.isReadonly;
  }
  const rawMessages = Array.isArray(data.messages) ? (data.messages as TradeApiMessage[]) : [];
  const messages: AdminChatMessage[] = rawMessages.map((m) => mapTradeApiMessage(m, roomId));
  const rawMods = Array.isArray(data.moderationLogs) ? data.moderationLogs : [];
  const moderationLogs: ChatModerationLog[] = rawMods.map(
    (log: {
      id: string;
      roomId?: string;
      actionType?: string;
      action_type?: string;
      adminId?: string;
      adminNickname?: string;
      note?: string;
      createdAt?: string;
      created_at?: string;
    }) => ({
      id: String(log.id),
      roomId: log.roomId ?? roomId,
      actionType: log.actionType ?? log.action_type ?? "",
      adminId: log.adminId ?? "",
      adminNickname: log.adminNickname ?? "",
      note: log.note ?? "",
      createdAt: log.createdAt ?? log.created_at ?? "",
    })
  );

  const reports: RoomReportRow[] = (Array.isArray(data.reports) ? data.reports : []).map(
    (rr: {
      id: string;
      reporter_user_id?: string;
      reporter_id?: string;
      reason_type?: string;
      reason_code?: string;
      reason_detail?: string | null;
      reason_text?: string | null;
      status?: string;
      created_at?: string;
      resolved_at?: string | null;
      resolved_by?: string | null;
    }) => ({
      id: rr.id,
      reporter_id: rr.reporter_user_id ?? rr.reporter_id ?? "",
      target_type: "chat_room",
      target_id: roomId,
      reason_code: rr.reason_type ?? rr.reason_code ?? "",
      reason_text: rr.reason_detail ?? rr.reason_text ?? null,
      status: rr.status ?? "",
      created_at: rr.created_at ?? "",
      resolved_at: rr.resolved_at ?? null,
      resolved_by: rr.resolved_by ?? null,
    })
  );
  const adminMemo = typeof data.adminMemo === "string" ? data.adminMemo : "";
  const messagesHasMore = Boolean(messenger && !messenger.legacyOnly && messenger.messagesHasMore);
  return { room, messages, reports, moderationLogs, adminMemo, messenger, messagesHasMore };
}

interface AdminChatDetailPageProps {
  roomId: string;
}

export function AdminChatDetailPage({ roomId }: AdminChatDetailPageProps) {
  const { t, safeT, language } = useI18n();
  const [forbidden, setForbidden] = useState(false);
  /** C-10: 불러오기 실패 ≠ 「방 없음」. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [room, setRoom] = useState<AdminChatRoom | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [roomReports, setRoomReports] = useState<RoomReportRow[]>([]);
  const [sanctions, setSanctions] = useState<SanctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modLogs, setModLogs] = useState<ChatModerationLog[]>([]);
  const [adminMemo, setAdminMemo] = useState("");
  const [messenger, setMessenger] = useState<AdminTradeMessengerInfo | null>(null);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);
  const returnCtx = useAdminLocationReturnTo();
  const messengerRoomId = messenger && !messenger.legacyOnly ? messenger.roomId : null;

  // R1-B C-6: 사용자 방(CM) 메시지 「이전 메시지 더 보기」 — 거래 연결 근거로 서버가 열람·감사
  const fetchOlderTrade = useCallback(
    async (beforeId: string) => {
      if (!messengerRoomId) return { items: [] as AdminChatMessage[], hasMore: false };
      const res = await fetch(
        `/api/admin/community-messenger/rooms/${encodeURIComponent(messengerRoomId)}/messages?before=${encodeURIComponent(beforeId)}&limit=80`,
        { cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hasMore?: boolean;
        messages?: Parameters<typeof mapCmPageItemToTradeApi>[0][];
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "load_failed");
      return {
        items: (j.messages ?? []).map((m) => mapTradeApiMessage(mapCmPageItemToTradeApi(m), roomId)),
        hasMore: j.hasMore === true,
      };
    },
    [messengerRoomId, roomId]
  );
  const olderMsgs = useAdminOlderMessages<AdminChatMessage>({
    resetKey: `${roomId}:${messengerRoomId ?? ""}`,
    latest: messages,
    latestHasMore: messagesHasMore,
    fetchOlder: fetchOlderTrade,
  });
  const { patchOlder } = olderMsgs;

  /** R1-B C-1: 메시지 숨김/해제 — 사용자 방(CM) 메시지에 메신저 관리자 경로(CAS·감사)로 적용 */
  const toggleMessageHidden = useCallback(
    async (message: AdminChatMessage, hidden: boolean) => {
      if (!messengerRoomId) return;
      const c = await confirmAdminAction({
        level: "L2",
        ko: language !== "en",
        title: hidden ? t("admin_chat_r1b_hide_message") : t("admin_chat_r1b_unhide_message"),
        confirmLabel: t("admin_chat_r1_action_confirm_cta"),
        destructive: hidden,
      });
      if (!c.ok || !c.reason || c.reason.trim().length < ADMIN_REASON_MIN_LENGTH) return;
      setBusyMessageId(message.id);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(messengerRoomId)}/messages/${encodeURIComponent(message.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden, reason: c.reason }),
            credentials: "same-origin",
          }
        );
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert({
            title: j.error === "stale_state" ? t("admin_chat_r1_stale_state") : (j.error ?? t("admin_chat_action_failed")),
          });
          if (j.error === "stale_state") refreshDetail();
          return;
        }
        patchOlder(message.id, { isHidden: hidden });
        refreshDetail();
      } finally {
        setBusyMessageId(null);
      }
    },
    [language, messengerRoomId, patchOlder, refreshDetail, t]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    setLoadFailed(false);

    (async () => {
      const fromApi = await fetchAdminChatDetailFromApi(roomId);
      if (!cancelled && fromApi) {
        setRoom(fromApi.room);
        setMessages(fromApi.messages);
        setRoomReports(fromApi.reports);
        setModLogs(fromApi.moderationLogs);
        setAdminMemo(fromApi.adminMemo);
        setMessenger(fromApi.messenger);
        setMessagesHasMore(fromApi.messagesHasMore);
        getSanctionsByUserIdsFromDb([fromApi.room.sellerId, fromApi.room.buyerId]).then(
          (s) => !cancelled && setSanctions(s)
        );
        setLoading(false);
        return;
      }

      const [roomFromDb, messagesFromDb, reports] = await Promise.all([
        getAdminChatRoomByIdFromDb(roomId),
        getAdminMessagesFromDb(roomId),
        getReportsByRoomIdFromDb(roomId),
      ]);
      if (cancelled) return;
      if (roomFromDb) {
        setRoom(roomFromDb);
        setMessenger(null);
        setMessagesHasMore(false);
        setMessages(messagesFromDb);
        setRoomReports(reports);
        setModLogs([]);
        setAdminMemo("");
        getSanctionsByUserIdsFromDb([roomFromDb.sellerId, roomFromDb.buyerId]).then(
          (s) => !cancelled && setSanctions(s)
        );
      } else {
        setRoom(null);
        setMessages([]);
        setRoomReports([]);
        setModLogs([]);
        setSanctions([]);
      }
    })().catch((e: unknown) => {
      if (!cancelled) {
        const isForbidden = Boolean((e as { adminForbidden?: boolean } | null)?.adminForbidden);
        setForbidden(isForbidden);
        setLoadFailed(!isForbidden);
        setRoom(null);
        setMessages([]);
        setRoomReports([]);
        setModLogs([]);
        setSanctions([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [roomId, refresh]);

  if (loading) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_chat_loading_room")}
      </div>
    );
  }

  if (forbidden) {
    return <AdminForbiddenState ko={language !== "en"} code="forbidden_permission" />;
  }

  if (loadFailed) {
    return <AdminErrorState ko={language !== "en"} code="load_failed" onRetry={refreshDetail} />;
  }

  if (!room) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_chat_room_not_found")}
      </div>
    );
  }

  const handleSaveMemo = async () => {
    const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/memo`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: memoInput }),
    });
    const j = (await res.json()) as { ok?: boolean; adminMemo?: string; error?: string };
    if (!res.ok || !j.ok) {
      await dibayAlert({ title: j.error ?? t("admin_chat_action_failed") });
      return;
    }
    setAdminMemo(j.adminMemo ?? memoInput);
    setMemoInput("");
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_page_chat_detail"
        backHref={
          returnCtx.returnTo ??
          (room.roomType === "item_trade" || Boolean(room.productId)
            ? "/admin/chats/trade"
            : "/admin/chats")
        }
      />

      {/* R1-B C-1: 사용자 앱과 같은 채팅방(CM) 연결 / 레거시 전용 기록 표시 */}
      {messengerRoomId ? (
        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
          data-admin-trade-messenger-room={messengerRoomId}
        >
          <p className="sam-text-helper text-sam-muted">{t("admin_chat_r1b_source_messenger")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-fg">
            {t("admin_chat_r1b_messenger_room_id")}: <span className="font-mono">{messengerRoomId}</span>
          </p>
          <Link
            href={adminCmRoomDetailHref(messengerRoomId, returnCtx.here)}
            className="mt-2 inline-block rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted"
          >
            {t("admin_chat_r1b_open_unified")}
          </Link>
        </section>
      ) : messenger?.legacyOnly ? (
        <section
          className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3"
          data-admin-trade-legacy-only="1"
        >
          <p className="sam-text-body font-semibold text-amber-900">{t("admin_chat_r1b_legacy_only")}</p>
          <p className="mt-1 sam-text-helper text-amber-800">{t("admin_chat_r1b_legacy_only_desc")}</p>
        </section>
      ) : null}

      <AdminCard title={t("admin_chat_room_info_card")}>
        <div className="flex gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            {room.productThumbnail ? (
              <img
                src={room.productThumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="sam-text-body font-semibold text-sam-fg">
              {room.productId ? (
                <Link
                  href={`/admin/products/${encodeURIComponent(room.productId)}`}
                  className="text-signature hover:underline"
                >
                  {room.productTitle || room.productId}
                </Link>
              ) : (
                room.productTitle
              )}
            </p>
            {room.productId ? (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 sam-text-body-secondary">
                <Link
                  href={`/admin/trade-flow?postId=${encodeURIComponent(room.productId)}`}
                  className="font-medium text-signature hover:underline"
                >
                  {safeT("admin_chat_open_trade_flow", {
                    fallbackKo: "거래 운영",
                    fallbackEn: "Trade flow",
                  })}
                </Link>
              </p>
            ) : null}
            <p className="sam-text-body-secondary text-sam-muted">ID: {room.id}</p>
            {room.roomType ? (
              <p className="sam-text-helper text-signature">
                {t("admin_chat_type_label")}: {room.roomType}
                {room.contextType ? ` · ${room.contextType}` : ""}
              </p>
            ) : null}
            {room.roomType === "meeting_open_chat" && room.meetingId ? (
              <p className="mt-1 sam-text-body-secondary">
                <Link
                  href={`/community-messenger/rooms/${encodeURIComponent(room.id)}`}
                  className="font-medium text-signature hover:underline"
                >
                  {t("admin_chat_move_to_meeting")}
                </Link>
              </p>
            ) : null}
            <AdminChatRoomStatusBadge status={room.roomStatus} className="mt-2" />
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              {t("admin_chat_message_report_count", {
                messageCount: room.messageCount,
                reportCount: room.reportCount,
              })}
            </p>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={t("admin_chat_participants")}>
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">
              {room.roomType === "item_trade" || !room.roomType ? t("admin_chat_seller") : t("admin_chat_participant_a")}
            </dt>
            <dd>
              {room.sellerId ? (
                <Link href={adminUserDetailHref(room.sellerId, returnCtx.here)} className="text-signature underline">
                  {room.sellerNickname || room.sellerId.slice(0, 8)}
                </Link>
              ) : (
                room.sellerNickname || "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {room.roomType === "item_trade" || !room.roomType ? t("admin_chat_buyer") : t("admin_chat_participant_b")}
            </dt>
            <dd>
              {room.buyerId ? (
                <Link href={adminUserDetailHref(room.buyerId, returnCtx.here)} className="text-signature underline">
                  {room.buyerNickname || room.buyerId.slice(0, 8)}
                </Link>
              ) : (
                room.buyerNickname || "—"
              )}
            </dd>
          </div>
        </dl>
        {messenger && !messenger.legacyOnly && messenger.participants.length ? (
          <div className="mt-3 border-t border-sam-border-soft pt-3">
            <p className="mb-1 sam-text-helper font-medium text-sam-muted">{t("admin_chat_r1b_participants_room")}</p>
            <ul className="space-y-1 sam-text-body-secondary text-sam-fg">
              {messenger.participants.map((p) => (
                <li key={p.userId} className="flex flex-wrap gap-x-2">
                  <Link href={adminUserDetailHref(p.userId, returnCtx.here)} className="text-signature underline">
                    {p.label}
                  </Link>
                  <span className="sam-text-xxs text-sam-muted">
                    {adminChatLabel("participant_role", p.role, language !== "en").label}
                  </span>
                  {p.unreadCount > 0 ? (
                    <span className="sam-text-xxs text-sam-muted">{t("admin_chat_r1b_unread", { count: p.unreadCount })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title={t("admin_chat_message_timeline")}>
        {olderMsgs.hasMore ? (
          <div className="mb-3 flex flex-col items-center gap-1">
            <button
              type="button"
              disabled={olderMsgs.loading}
              onClick={() => void olderMsgs.loadOlder()}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
            >
              {olderMsgs.loading ? t("admin_chat_r1b_loading_older") : t("admin_chat_r1b_load_older")}
            </button>
            {olderMsgs.error ? <p className="sam-text-xxs text-red-700">{t("admin_chat_r1b_load_older_failed")}</p> : null}
          </div>
        ) : null}
        <AdminChatMessageTimeline
          messages={olderMsgs.messages}
          onToggleHidden={messengerRoomId ? (m, hidden) => void toggleMessageHidden(m, hidden) : undefined}
          busyMessageId={busyMessageId}
        />
      </AdminCard>

      <AdminCard title={t("admin_chat_admin_memo")}>
        {adminMemo && (
          <p className="mb-2 sam-text-body-secondary text-sam-fg">{adminMemo}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t("admin_chat_memo_placeholder")}
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            {t("admin_chat_save_memo")}
          </button>
        </div>
      </AdminCard>

      <AdminCard title={t("admin_chat_admin_action")}>
        <AdminChatActionPanel
          room={room}
          onActionSuccess={refreshDetail}
          legacyOnly={messenger?.legacyOnly === true}
        />
      </AdminCard>

      <AdminCard title={t("admin_chat_related_reports")}>
        {roomReports.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_chat_no_reports")}</p>
        ) : (
          <ul className="space-y-2">
            {roomReports.map((rp) => (
              <li key={rp.id} className="flex items-center justify-between gap-2 border-b border-sam-border-soft py-2 sam-text-body-secondary">
                <span className="min-w-0 flex-1 truncate text-sam-fg">
                  {adminChatLabel("report_reason", rp.reason_code, language !== "en").label}
                  {rp.reason_text ? ` · ${rp.reason_text}` : ""}
                </span>
                <span className="shrink-0 text-sam-muted">
                  {adminChatLabel("report_status", rp.status, language !== "en").label}
                </span>
                <Link
                  href={`${ADMIN_CHAT_REPORT_QUEUE_PATH}?status=all&target=${encodeURIComponent(roomId)}`}
                  className="shrink-0 font-medium text-signature hover:underline"
                >
                  {t("admin_chat_detail_short")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title={t("admin_chat_sanctions_history")}>
        {sanctions.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_chat_no_sanctions")}</p>
        ) : (
          <ul className="space-y-2 sam-text-body-secondary">
            {sanctions.map((s) => (
              <li key={s.id} className="flex justify-between border-b border-sam-border-soft py-2">
                <span className="text-sam-fg">{s.sanction_type}</span>
                <span className="text-sam-muted">
                  {new Date(s.created_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title={t("admin_chat_action_history")}>
        <AdminChatModerationLogList logs={modLogs} />
      </AdminCard>
    </div>
  );
}
