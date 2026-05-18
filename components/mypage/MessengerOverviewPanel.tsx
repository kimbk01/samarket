"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";

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

export function MessengerOverviewPanel({ mode }: { mode: "dm" | "groups" }) {
  const { t, language } = useI18n();
  const dateLocale = language === "en" ? "en-US" : "ko-KR";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<string, number>>({});
  const [chats, setChats] = useState<MessengerRoomSummary[]>([]);
  const [groups, setGroups] = useState<MessengerRoomSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchCommunityMessengerBootstrapClient("full");
        const json = (await res.json().catch(() => ({}))) as MessengerBootstrapPayload;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(t("mypage_comp_messenger_load_failed"));
          return;
        }
        setTabs(json.tabs ?? {});
        setChats(Array.isArray(json.chats) ? json.chats : []);
        setGroups(Array.isArray(json.groups) ? json.groups : []);
      } catch {
        if (!cancelled) setError(t("mypage_comp_messenger_load_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const items = mode === "dm" ? chats : groups;
  const unreadCount = Number(tabs[mode === "dm" ? "chats" : "groups"] ?? 0);
  const channelLabel =
    mode === "dm" ? t("mypage_comp_messenger_channel_dm") : t("mypage_comp_messenger_channel_groups");
  const emptyMessage =
    mode === "dm" ? t("mypage_comp_messenger_empty_dm") : t("mypage_comp_messenger_empty_groups");

  function formatDateTime(iso: string): string {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleString(dateLocale, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
        <p className="sam-text-body-secondary font-medium text-sam-fg">
          {t("mypage_comp_messenger_unread_line", { channel: channelLabel, count: unreadCount })}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">{t("mypage_comp_messenger_hint")}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        {loading ? (
          <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">{t("mypage_comp_loading")}</div>
        ) : error ? (
          <div className="px-4 py-8 text-center sam-text-helper text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center sam-text-helper text-sam-muted">{emptyMessage}</div>
        ) : (
          <div className="divide-y divide-sam-border">
            {items.slice(0, 6).map((room) => (
              <Link
                key={room.id}
                href={`/community-messenger/rooms/${encodeURIComponent(room.id)}`}
                className="block px-4 py-3 hover:bg-sam-app"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-medium text-sam-fg">{room.title}</p>
                    <p className="mt-1 line-clamp-2 sam-text-helper text-sam-muted">
                      {room.lastMessage || room.summary || t("mypage_comp_messenger_no_message")}
                    </p>
                    <p className="mt-1 sam-text-xxs text-sam-meta">
                      {[
                        room.memberCount > 0
                          ? t("mypage_comp_messenger_members", { count: room.memberCount })
                          : "",
                        formatDateTime(room.lastMessageAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {room.unreadCount > 0 ? (
                    <span className="rounded-full bg-signature px-2 py-0.5 sam-text-xxs font-semibold text-white">
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
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper font-medium text-sam-fg"
        >
          {t("mypage_comp_messenger_open_full")}
        </Link>
        {mode === "dm" ? (
          <Link
            href="/mypage/section/settings/chat-settings"
            className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper font-medium text-sam-fg"
          >
            {t("mypage_comp_chat_settings")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
