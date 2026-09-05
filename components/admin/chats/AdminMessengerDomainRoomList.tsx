"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import type {
  AdminCmDomainListDomain,
  AdminCommunityMessengerDomainRoomRow,
} from "@/lib/admin-community-messenger/service";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";

export type AdminMessengerDomainListMode = "general" | "group" | "store_order";

const MODE_TO_DOMAIN: Record<AdminMessengerDomainListMode, AdminCmDomainListDomain> = {
  general: "general_direct",
  group: "group",
  store_order: "store_order",
};

type Props = {
  mode: AdminMessengerDomainListMode;
};

export function AdminMessengerDomainRoomList({ mode }: Props) {
  const { t, safeT, language } = useI18n();
  const domain = MODE_TO_DOMAIN[mode];
  const [rooms, setRooms] = useState<AdminCommunityMessengerDomainRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title =
    mode === "general"
      ? safeT("admin_chat_list_title_general", {
          fallbackKo: "일반 채팅",
          fallbackEn: "General chats",
        })
      : mode === "group"
        ? safeT("admin_chat_list_title_group", {
            fallbackKo: "그룹 채팅",
            fallbackEn: "Group chats",
          })
        : safeT("admin_chat_list_title_store_order", {
            fallbackKo: "주문 채팅",
            fallbackEn: "Order chats",
          });

  const description =
    mode === "general"
      ? safeT("admin_chat_list_desc_general", {
          fallbackKo: "커뮤니티 메신저 general_direct 방 목록입니다.",
          fallbackEn: "Community messenger general_direct rooms.",
        })
      : mode === "group"
        ? safeT("admin_chat_list_desc_group", {
            fallbackKo: "커뮤니티 메신저 group 방 목록입니다.",
            fallbackEn: "Community messenger group rooms.",
          })
        : safeT("admin_chat_list_desc_store_order", {
            fallbackKo: "커뮤니티 메신저 store_order 방 목록입니다.",
            fallbackEn: "Community messenger store_order rooms.",
          });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/community-messenger/rooms?domain=${encodeURIComponent(domain)}`,
        { credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rooms?: AdminCommunityMessengerDomainRoomRow[];
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setRooms([]);
        setError(json?.error || "load_failed");
        return;
      }
      setRooms(Array.isArray(json.rooms) ? json.rooms : []);
    } catch {
      setRooms([]);
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="messenger"
      data-admin-chat-domain={domain}
      data-testid={`admin-messenger-domain-list-${mode}`}
    >
      <AdminPageHeader title={title} description={description} />

      {mode === "general" || mode === "group" ? (
        <p className="sam-text-helper text-sam-muted" data-admin-domain-reset-entry="chat">
          <Link
            href={buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.chat)}
            className="text-signature hover:underline"
          >
            {language === "en"
              ? "Clean test chat data (Reset · chat scope)"
              : "테스트 채팅 데이터 정리 (Reset · chat 범위)"}
          </Link>
          <span className="ml-2">
            {language === "en"
              ? "Permanent DB wipe uses Reset with chatRoomIds + chat scope only. Trade/order rooms stay protected."
              : "DB 영구 삭제는 Reset에서 chatRoomIds + chat 범위로만 수행합니다. 거래·주문 방은 보호됩니다."}
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="rounded-ui-rect border border-sam-danger/40 bg-sam-danger/5 px-3 py-2 text-sm text-sam-danger">
          {safeT("admin_chat_domain_list_error", {
            fallbackKo: "목록을 불러오지 못했습니다. 다시 시도해 주세요.",
            fallbackEn: "Could not load the list. Please try again.",
          })}
        </p>
      ) : null}

      {loading ? (
        <p className="sam-text-body-secondary text-sam-muted">
          {safeT("admin_chat_domain_list_loading", {
            fallbackKo: "불러오는 중…",
            fallbackEn: "Loading…",
          })}
        </p>
      ) : rooms.length === 0 ? (
        <p
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-sm text-sam-muted"
          data-testid="admin-messenger-domain-empty"
        >
          {safeT("admin_chat_domain_list_empty", {
            fallbackKo: "채팅 없음",
            fallbackEn: "No chats",
          })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {safeT("admin_chat_domain_col_title", {
                    fallbackKo: "방",
                    fallbackEn: "Room",
                  })}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {safeT("admin_chat_domain_col_members", {
                    fallbackKo: "참여자",
                    fallbackEn: "Members",
                  })}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {safeT("admin_chat_domain_col_last", {
                    fallbackKo: "최근 메시지",
                    fallbackEn: "Last message",
                  })}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_chat_room_status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-sam-border/70 last:border-0">
                  <td className="px-3 py-2.5 align-top">
                    <Link
                      href={`/admin/chats/messenger/${encodeURIComponent(room.id)}`}
                      className="font-medium text-signature underline"
                    >
                      {room.title || room.id.slice(0, 8)}
                    </Link>
                    <div className="mt-0.5 font-mono sam-text-xxs text-sam-muted">{room.id}</div>
                    {room.openReportCount > 0 ? (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 sam-text-xxs text-amber-950">
                        {safeT("admin_chat_domain_report_count", {
                          fallbackKo: `신고 ${room.openReportCount}`,
                          fallbackEn: `Reports ${room.openReportCount}`,
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      {room.memberUserIds.length === 0 ? (
                        <span className="text-sam-muted">-</span>
                      ) : (
                        room.memberUserIds.slice(0, 6).map((uid, i) => (
                          <Link
                            key={uid}
                            href={`/admin/users/${encodeURIComponent(uid)}`}
                            className="text-signature underline"
                          >
                            {room.memberLabels[i] || uid.slice(0, 8)}
                          </Link>
                        ))
                      )}
                      {room.memberCount > 6 ? (
                        <span className="text-sam-muted">+{room.memberCount - 6}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="line-clamp-2 text-sam-fg">{room.lastMessage}</div>
                    <div className="mt-0.5 sam-text-xxs text-sam-muted">
                      {room.lastMessageAt
                        ? formatAdminDateTime(room.lastMessageAt, language)
                        : "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-sam-fg">{room.roomStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
