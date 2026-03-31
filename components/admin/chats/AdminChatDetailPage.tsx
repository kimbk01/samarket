"use client";

import { useCallback, useState, useEffect } from "react";
import type {
  AdminChatRoom,
  AdminChatMessage,
  AdminChatMessageType,
  ChatModerationLog,
} from "@/lib/types/admin-chat";
import { getAdminMemo, setAdminMemo } from "@/lib/admin-chats/mock-admin-chat-rooms";
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
import { AdminChatRoomStatusBadge } from "./AdminChatRoomStatusBadge";
import { AdminChatMessageTimeline } from "./AdminChatMessageTimeline";
import { AdminChatActionPanel } from "./AdminChatActionPanel";
import { AdminChatModerationLogList } from "./AdminChatModerationLogList";

/** chat_rooms 기반 관리자 상세 API 응답 → AdminChatRoom + AdminChatMessage[] 로 변환 */
async function fetchAdminChatDetailFromApi(
  roomId: string
): Promise<{
  room: AdminChatRoom;
  messages: AdminChatMessage[];
  reports: RoomReportRow[];
  moderationLogs: ChatModerationLog[];
} | null> {
  const res = await fetch(`/api/admin/chat/rooms/${roomId}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
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
  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  const messages: AdminChatMessage[] = rawMessages.map(
    (m: { id: string; sender_id: string | null; message_type?: string; body?: string; created_at?: string; is_hidden_by_admin?: boolean }) => ({
      id: m.id,
      roomId: roomId,
      senderId: m.sender_id ?? "",
      senderNickname: (m.sender_id ?? "").slice(0, 8),
      messageType: (m.message_type === "image" || m.message_type === "system" ? m.message_type : "text") as AdminChatMessageType,
      message: m.body ?? "",
      createdAt: m.created_at ?? "",
      isHidden: m.is_hidden_by_admin ?? false,
    })
  );
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
  return { room, messages, reports, moderationLogs };
}

interface AdminChatDetailPageProps {
  roomId: string;
}

export function AdminChatDetailPage({ roomId }: AdminChatDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [room, setRoom] = useState<AdminChatRoom | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [roomReports, setRoomReports] = useState<RoomReportRow[]>([]);
  const [sanctions, setSanctions] = useState<SanctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modLogs, setModLogs] = useState<ChatModerationLog[]>([]);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const fromApi = await fetchAdminChatDetailFromApi(roomId);
      if (!cancelled && fromApi) {
        setRoom(fromApi.room);
        setMessages(fromApi.messages);
        setRoomReports(fromApi.reports);
        setModLogs(fromApi.moderationLogs);
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
        setMessages(messagesFromDb);
        setRoomReports(reports);
        setModLogs([]);
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
    })().catch(() => {
      if (!cancelled) {
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
      <div className="py-8 text-center text-[14px] text-gray-500">
        불러오는 중...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        채팅방을 찾을 수 없습니다.
      </div>
    );
  }

  const hasMemo = getAdminMemo(roomId);

  const handleSaveMemo = () => {
    setAdminMemo(roomId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="채팅 상세" backHref="/admin/chats" />

      <AdminCard title="채팅방 정보">
        <div className="flex gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {room.productThumbnail ? (
              <img
                src={room.productThumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-gray-900">
              {room.productTitle}
            </p>
            <p className="text-[13px] text-gray-500">ID: {room.id}</p>
            {room.roomType ? (
              <p className="text-[12px] text-signature">
                유형: {room.roomType}
                {room.contextType ? ` · ${room.contextType}` : ""}
              </p>
            ) : null}
            {room.roomType === "meeting_open_chat" && room.meetingId ? (
              <p className="mt-1 text-[13px]">
                <Link
                  href={`/philife/meetings/${room.meetingId}`}
                  className="font-medium text-signature hover:underline"
                >
                  모임 페이지로 이동
                </Link>
              </p>
            ) : null}
            <AdminChatRoomStatusBadge status={room.roomStatus} className="mt-2" />
            <p className="mt-2 text-[13px] text-gray-600">
              메시지 {room.messageCount} · 신고 {room.reportCount}
            </p>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="참여자">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-gray-500">
              {room.roomType === "item_trade" || !room.roomType ? "판매자" : "참여자 A"}
            </dt>
            <dd>
              {room.sellerNickname} ({room.sellerId || "—"})
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">
              {room.roomType === "item_trade" || !room.roomType ? "구매자" : "참여자 B"}
            </dt>
            <dd>
              {room.buyerNickname} ({room.buyerId || "—"})
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="메시지 타임라인">
        <AdminChatMessageTimeline messages={messages} />
      </AdminCard>

      <AdminCard title="관리자 메모 (placeholder)">
        {hasMemo && (
          <p className="mb-2 text-[13px] text-gray-700">{hasMemo}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="메모 입력"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            저장
          </button>
        </div>
      </AdminCard>

      <AdminCard title="관리자 액션">
        <AdminChatActionPanel room={room} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard title="관련 신고 목록">
        {roomReports.length === 0 ? (
          <p className="text-[13px] text-gray-500">해당 채팅방 신고 없음</p>
        ) : (
          <ul className="space-y-2">
            {roomReports.map((rp) => (
              <li key={rp.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-gray-700">{rp.reason_code}</span>
                <span className="shrink-0 text-gray-500">{rp.status}</span>
                <Link
                  href={`/admin/reports/${rp.id}`}
                  className="shrink-0 font-medium text-signature hover:underline"
                >
                  상세
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="제재 이력 (판매자/구매자)">
        {sanctions.length === 0 ? (
          <p className="text-[13px] text-gray-500">제재 이력 없음</p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {sanctions.map((s) => (
              <li key={s.id} className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-gray-700">{s.sanction_type}</span>
                <span className="text-gray-500">
                  {new Date(s.created_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="조치 이력">
        <AdminChatModerationLogList logs={modLogs} />
      </AdminCard>
    </div>
  );
}
