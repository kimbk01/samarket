/**
 * Messenger Domain Dashboard — separate authority counts (read-only composition).
 * GENERAL/GROUP = community_messenger_rooms by chat_domain
 * TRADE = product_chats
 * ORDER = store_orders with community_messenger_room_id
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";

export async function loadMessengerDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sectionErrors: string[] = [];
  const sb = getSupabaseServer() as any;

  const [general, group, trade, order, cmReports, tradeChatReports, blockedCm] = await Promise.all([
    adminDomainCountExact(() =>
      sb
        .from("community_messenger_rooms")
        .select("id", { count: "exact", head: true })
        .eq("chat_domain", "general_direct")
    ),
    adminDomainCountExact(() =>
      sb
        .from("community_messenger_rooms")
        .select("id", { count: "exact", head: true })
        .eq("chat_domain", "group")
    ),
    adminDomainCountExact(() => sb.from("product_chats").select("id", { count: "exact", head: true })),
    adminDomainCountExact(() =>
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .not("community_messenger_room_id", "is", null)
    ),
    adminDomainCountExact(() =>
      sb
        .from("community_messenger_reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["received", "reviewing"])
    ),
    adminDomainCountExact(() =>
      sb
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("target_type", "chat_room")
        .in("status", ["pending", "reviewing"])
    ),
    adminDomainCountExact(() =>
      sb
        .from("community_messenger_rooms")
        .select("id", { count: "exact", head: true })
        .eq("room_status", "blocked")
    ),
  ]);

  if (general == null) sectionErrors.push("cm_general:unavailable");
  if (group == null) sectionErrors.push("cm_group:unavailable");
  if (trade == null) sectionErrors.push("product_chats:unavailable");
  if (order == null) sectionErrors.push("order_chats:unavailable");

  const recent: AdminDomainDashboardModel["recent"] = [];
  try {
    const { data, error } = await sb
      .from("community_messenger_rooms")
      .select("id, title, chat_domain, last_message_at, room_status")
      .in("chat_domain", ["general_direct", "group"])
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) sectionErrors.push(`messenger_recent:${error.message}`);
    else {
      for (const row of data ?? []) {
        const domain = String(row.chat_domain ?? "");
        recent.push({
          id: String(row.id),
          title: String(row.title ?? row.id).slice(0, 80) || String(row.id),
          metaKo: `${domain} · ${String(row.room_status ?? "—")}`,
          metaEn: `${domain} · ${String(row.room_status ?? "—")}`,
          href: `/admin/chats/messenger?room=${encodeURIComponent(String(row.id))}`,
          at: row.last_message_at ? String(row.last_message_at) : null,
        });
      }
    }
  } catch (e) {
    sectionErrors.push(`messenger_recent:${e instanceof Error ? e.message : "error"}`);
  }

  const actionRequired = [
    {
      id: "cm_reports",
      labelKo: "메신저 신고 검토",
      labelEn: "Messenger report review",
      count: cmReports,
      href: "/admin/chats/reported",
      source: "community_messenger_reports received|reviewing",
      owner: "community_messenger_reports",
    },
    {
      id: "trade_chat_reports",
      labelKo: "거래 채팅 신고",
      labelEn: "Trade chat reports",
      count: tradeChatReports,
      href: "/admin/chats/reported",
      source: "reports.target_type=chat_room",
      owner: "reports",
    },
    {
      id: "blocked",
      labelKo: "차단/관리 필요 방",
      labelEn: "Blocked rooms",
      count: blockedCm,
      href: "/admin/chats/messenger",
      source: "community_messenger_rooms.room_status=blocked",
      owner: "community_messenger_rooms",
    },
  ].filter((r) => r.count === null || (r.count ?? 0) > 0);

  return {
    domain: "messenger",
    titleKo: "채팅 운영 대시보드",
    titleEn: "Messenger operations dashboard",
    descriptionKo:
      "일반·그룹·거래·주문 채팅 권한을 분리해 상태를 보고, 각 목록/신고 큐로 이동합니다.",
    descriptionEn:
      "Separate GENERAL / GROUP / TRADE / ORDER authorities — jump to each list or report queue.",
    currentState: [
      {
        id: "general",
        labelKo: "일반 채팅",
        labelEn: "General chats",
        value: general,
        href: "/admin/chats/general",
        source: "community_messenger_rooms.chat_domain=general_direct",
      },
      {
        id: "group",
        labelKo: "그룹 채팅",
        labelEn: "Group chats",
        value: group,
        href: "/admin/chats/group",
        source: "community_messenger_rooms.chat_domain=group",
      },
      {
        id: "trade",
        labelKo: "거래 채팅",
        labelEn: "Trade chats",
        value: trade,
        href: "/admin/chats/trade",
        source: "product_chats",
      },
      {
        id: "order",
        labelKo: "주문 채팅",
        labelEn: "Order chats",
        value: order,
        href: "/admin/order-chats",
        source: "store_orders.community_messenger_room_id",
      },
      {
        id: "reported",
        labelKo: "메신저 신고(오픈)",
        labelEn: "Open messenger reports",
        value: cmReports,
        href: "/admin/chats/reported",
        source: "community_messenger_reports received|reviewing",
      },
    ],
    actionRequired,
    domainHealth: [],
    issues: actionRequired,
    primaryEntries: [
      {
        id: "general",
        labelKo: "일반 채팅 목록",
        labelEn: "General list",
        href: "/admin/chats/general",
        frequency: "FREQUENT",
      },
      {
        id: "group",
        labelKo: "그룹 채팅 목록",
        labelEn: "Group list",
        href: "/admin/chats/group",
        frequency: "FREQUENT",
      },
      {
        id: "trade",
        labelKo: "거래 채팅 목록",
        labelEn: "Trade list",
        href: "/admin/chats/trade",
        frequency: "FREQUENT",
      },
      {
        id: "order",
        labelKo: "주문 채팅 목록",
        labelEn: "Order list",
        href: "/admin/order-chats",
        frequency: "FREQUENT",
      },
      {
        id: "reported",
        labelKo: "신고 채팅",
        labelEn: "Reported chats",
        href: "/admin/chats/reported",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "advanced",
        labelKo: "메신저 고급",
        labelEn: "Messenger advanced",
        href: "/admin/chats/messenger",
        frequency: "OCCASIONAL",
      },
      {
        id: "perf",
        labelKo: "메신저 성능",
        labelEn: "Messenger performance",
        href: "/admin/chats/messenger-performance",
        frequency: "OCCASIONAL",
      },
    ],
    contextEntries: [
      {
        id: "all",
        labelKo: "전체 채팅",
        labelEn: "All chats",
        href: "/admin/chats",
        frequency: "OCCASIONAL",
      },
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: "/admin/support?filter=ACTIONABLE#action-required",
        frequency: "OCCASIONAL",
      },
      {
        id: "action_center",
        labelKo: "전역 Action Center",
        labelEn: "Global Action Center",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "notifications",
        labelKo: "알림",
        labelEn: "Notifications",
        href: "/admin/notifications",
        frequency: "OCCASIONAL",
      },
      {
        id: "reset",
        labelKo: "테스트 채팅 데이터 정리",
        labelEn: "Clean test chat data",
        href: buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.chat),
        frequency: "CONFIGURATION",
      },
    ],
    recent,
    sectionErrors,
  };
}
