"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ChatInputBar } from "@/components/chats/ChatInputBar";
import { ChatMessageList } from "@/components/chats/ChatMessageList";
import { ChatMessagesLoadingSkeleton } from "@/components/chats/ChatMessagesLoadingSkeleton";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { mergeChatMessagesById } from "@/lib/chats/merge-chat-messages";
import { useChatRoomRealtime } from "@/lib/chats/use-chat-room-realtime";
import { mapGroupApiRowToChatMessage } from "@/lib/group-chat/map-api-messages";
import type { ChatMessage } from "@/lib/types/chat";
import {
  APP_MAIN_COLUMN_MAX_WIDTH_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

const THREAD_INNER = `mx-auto w-full min-w-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

type BootstrapOk = {
  ok: true;
  room: { id: string; title?: string; memberCount?: number };
  messages: Record<string, unknown>[];
};

export function GroupChatRoomClient({
  roomId,
  listHref = "/group-chat",
}: {
  roomId: string;
  listHref?: string;
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const readPostedRef = useRef(false);
  const threadScrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getCurrentUser();
    setCurrentUserId(u?.id ?? null);
  }, []);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setBootstrapReady(false);
    readPostedRef.current = false;
    try {
      const res = await fetch(`/api/group-chat/rooms/${encodeURIComponent(roomId)}/bootstrap`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as BootstrapOk & { error?: string };
      if (!res.ok) {
        setErr(typeof data?.error === "string" ? data.error : "불러오지 못했습니다.");
        setMessages([]);
        return;
      }
      if (!data.ok || !data.room) {
        setErr("방 정보가 없습니다.");
        return;
      }
      setTitle(data.room.title ?? "");
      setMemberCount(typeof data.room.memberCount === "number" ? data.room.memberCount : null);
      const mapped = (Array.isArray(data.messages) ? data.messages : []).map((m) =>
        mapGroupApiRowToChatMessage(m as Record<string, unknown>, roomId)
      );
      setMessages(mapped);
      setBootstrapReady(true);
    } catch {
      setErr("네트워크 오류입니다.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const postRead = useCallback(async () => {
    if (readPostedRef.current) return;
    readPostedRef.current = true;
    try {
      await fetch(`/api/group-chat/rooms/${encodeURIComponent(roomId)}/read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      readPostedRef.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    if (bootstrapReady && !loading) {
      void postRead();
    }
  }, [bootstrapReady, loading, postRead]);

  const onRealtimeMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => mergeChatMessagesById(prev, [msg]));
  }, []);

  const onRealtimeRemoved = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  useChatRoomRealtime({
    roomId,
    mode: "group",
    enabled: Boolean(roomId && currentUserId),
    bootstrapReady,
    onMessage: onRealtimeMessage,
    onMessageRemoved: onRealtimeRemoved,
  });

  const handleSend = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || !currentUserId) return;
      try {
        const res = await fetch(`/api/group-chat/rooms/${encodeURIComponent(roomId)}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: t, messageType: "text" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          return;
        }
        const m = data?.message as { id?: string; createdAt?: string } | undefined;
        const newId = m?.id;
        const createdAt = m?.createdAt;
        if (newId && createdAt) {
          setMessages((prev) =>
            mergeChatMessagesById(prev, [
              {
                id: newId,
                roomId,
                senderId: currentUserId,
                message: t,
                messageType: "text",
                createdAt,
                isRead: false,
                readAt: null,
              },
            ])
          );
        }
      } catch {
        /* ignore */
      }
    },
    [roomId, currentUserId]
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F7F7]">
      <header className="shrink-0 border-b border-sam-border bg-sam-surface px-3 py-2">
        <div className={`flex items-center gap-2 ${THREAD_INNER}`}>
          <AppBackButton backHref={listHref} preferHistoryBack={false} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold text-sam-fg">{title || "그룹 채팅"}</h1>
            {memberCount != null ? (
              <p className="truncate text-[12px] text-sam-muted">{memberCount}명</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={threadScrollParentRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1"
        >
          <div className={THREAD_INNER}>
            {loading ? (
              <ChatMessagesLoadingSkeleton variant="default" />
            ) : err ? (
              <div className="px-4 py-8 text-center text-[14px] text-sam-muted">{err}</div>
            ) : (
              <ChatMessageList
                messages={messages}
                currentUserId={currentUserId ?? ""}
                variant="default"
                virtualize
                scrollParentRef={threadScrollParentRef as RefObject<HTMLElement | null>}
              />
            )}
          </div>
        </div>
      </div>

      {!loading && !err ? (
        <div className="shrink-0 border-t border-sam-border bg-sam-surface safe-area-pb">
          <ChatInputBar
            onSend={(msg) => void handleSend(msg)}
            draftStorageKey={`group-chat:${roomId}`}
            disabled={!currentUserId}
            placeholder={currentUserId ? "메시지를 입력하세요" : "로그인 후 메시지를 보낼 수 있어요"}
          />
        </div>
      ) : null}
    </div>
  );
}
