"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MessengerRoomSummary = {
  id: string;
  title: string;
  summary: string;
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  memberCount: number;
};

type MessengerBootstrapPayload = {
  ok?: boolean;
  tabs?: Record<string, number>;
  chats?: MessengerRoomSummary[];
  groups?: MessengerRoomSummary[];
};

function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessengerOverviewPanel({ mode }: { mode: "dm" | "groups" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<string, number>>({});
  const [chats, setChats] = useState<MessengerRoomSummary[]>([]);
  const [groups, setGroups] = useState<MessengerRoomSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-messenger/bootstrap", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as MessengerBootstrapPayload;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError("메신저 상태를 불러오지 못했습니다.");
          return;
        }
        setTabs(json.tabs ?? {});
        setChats(Array.isArray(json.chats) ? json.chats : []);
        setGroups(Array.isArray(json.groups) ? json.groups : []);
      } catch {
        if (!cancelled) setError("메신저 상태를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = mode === "dm" ? chats : groups;
  const unreadCount = Number(tabs[mode === "dm" ? "chats" : "groups"] ?? 0);
  const emptyMessage = mode === "dm" ? "아직 1:1 대화방이 없습니다." : "아직 참여 중인 그룹방이 없습니다.";

  return (
    <div className="space-y-3">
      <div className="rounded-ui-rect border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[13px] font-medium text-gray-900">
          {mode === "dm" ? "1:1 채팅" : "그룹 채팅"} 미확인 {unreadCount}건
        </p>
        <p className="mt-1 text-[12px] text-gray-500">
          최근 대화방을 여기서 확인하고, 상세 운영은 메신저 화면으로 이어집니다.
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white">
        {loading ? (
          <div className="px-4 py-8 text-center text-[12px] text-gray-500">불러오는 중입니다.</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-gray-500">{emptyMessage}</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {items.slice(0, 6).map((room) => (
              <Link
                key={room.id}
                href={`/community-messenger/rooms/${encodeURIComponent(room.id)}`}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-gray-900">{room.title}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] text-gray-600">
                      {room.lastMessage || room.summary || "메시지가 없습니다."}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {[room.memberCount > 0 ? `참여 ${room.memberCount}명` : "", formatDateTime(room.lastMessageAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {room.unreadCount > 0 ? (
                    <span className="rounded-full bg-signature px-2 py-0.5 text-[11px] font-semibold text-white">
                      {room.unreadCount}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={
            mode === "dm"
              ? "/community-messenger?section=chats"
              : "/community-messenger?section=chats&filter=private_group"
          }
          className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
        >
          전체 메신저 열기
        </Link>
        {mode === "dm" ? (
          <Link
            href="/mypage/section/settings/chat-settings"
            className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
          >
            채팅 설정
          </Link>
        ) : null}
      </div>
    </div>
  );
}
