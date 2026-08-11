"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberMetricGrid, AdminMemberPager } from "@/components/admin/users/AdminMemberMetricGrid";
import {
  memberGroupAdminHref,
  memberMessengerAdminHref,
  memberOrderRoomAdminHref,
  memberTradeChatAdminHref,
} from "@/lib/admin-users/member-deep-links";
import type { MemberChatTabPayload } from "@/lib/admin-users/member-chat-tab";
import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

type DomainFilter = ChatDomain | "all" | "legacy_group";

export function AdminMemberChatPanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberChatTabPayload }>({
    kind: "loading",
  });
  const locale = language === "en" ? "en-US" : "ko-KR";
  const fmt = (value: string | null) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
  };

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const qs = new URLSearchParams({ domain, page: String(page), pageSize: "10" });
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/chats?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as MemberChatTabPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ok", data });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, domain, page]);

  if (state.kind === "loading") {
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-[#667085]`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-[#b42318]`}>
        {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
      </div>
    );
  }

  const { summary, total, rooms } = state.data;
  const hasNext = total.ok && page * 10 < total.value;
  const domainLabel = (id: ChatDomain) =>
    id === "general_direct"
      ? t("admin_users_cc_chat_general_direct")
      : id === "group"
        ? t("admin_users_cc_chat_group")
        : id === "trade"
          ? t("admin_users_cc_chat_trade")
          : t("admin_users_cc_chat_store_order");

  return (
    <div className="space-y-4">
      <AdminMemberMetricGrid
        items={[
          { label: t("admin_users_cc_chat_general_direct"), metric: summary.byDomain.general_direct },
          { label: t("admin_users_cc_chat_group"), metric: summary.byDomain.group },
          { label: t("admin_users_cc_chat_trade"), metric: summary.byDomain.trade },
          { label: t("admin_users_cc_chat_store_order"), metric: summary.byDomain.store_order },
          {
            label: safeT("admin_users_cc_summary_legacy_group", { fallbackKo: "레거시 그룹", fallbackEn: "Legacy groups" }),
            metric: summary.legacyGroup,
          },
          {
            label: t("admin_users_cc_overview_last_chat"),
            metric: summary.lastMessageAt,
            format: (value) => fmt(typeof value === "string" ? value : null),
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {(["all", ...CHAT_DOMAINS, "legacy_group"] as DomainFilter[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setDomain(id);
              setPage(1);
            }}
            className={
              domain === id
                ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085]"
            }
          >
            {id === "all"
              ? t("admin_users_tab_all")
              : id === "legacy_group"
                ? safeT("admin_users_cc_summary_legacy_group", { fallbackKo: "레거시 그룹", fallbackEn: "Legacy groups" })
                : domainLabel(id)}
          </button>
        ))}
      </div>
      <div className={`${ADMIN_USERS_LITE_CARD} divide-y divide-[#eaecf0]`}>
        {rooms.map((row) => (
          <div key={`${row.source}:${row.id}`} className="space-y-1 px-4 py-3">
            <p className="text-sm font-semibold text-[#101828]">{row.title || row.identity || row.id}</p>
            <p className="text-xs text-[#667085]">
              {row.domain} · {row.source} · {row.roomStatus || "—"} · {fmt(row.lastMessageAt)}
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
              {row.source === "legacy_group_rooms" || row.domain === "group" ? (
                <Link href={memberGroupAdminHref()}>
                  {safeT("admin_users_cc_cta_group_admin", { fallbackKo: "그룹 운영 화면에서 보기", fallbackEn: "Open group admin" })}
                </Link>
              ) : null}
              {row.domain === "trade" ? (
                <Link href={memberTradeChatAdminHref()}>
                  {safeT("admin_users_cc_cta_trade_chat_admin", { fallbackKo: "Trade chat 관리에서 보기", fallbackEn: "Open trade chat admin" })}
                </Link>
              ) : null}
              {row.domain === "store_order" ? (
                <Link href={memberOrderRoomAdminHref()}>
                  {safeT("admin_users_cc_cta_order_room_admin", { fallbackKo: "Order room 관리에서 보기", fallbackEn: "Open order room admin" })}
                </Link>
              ) : null}
              <Link href={memberMessengerAdminHref(userId)}>
                {safeT("admin_users_cc_cta_messenger", { fallbackKo: "메신저 운영 화면에서 보기", fallbackEn: "Open messenger admin" })}
              </Link>
            </div>
          </div>
        ))}
        {rooms.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#667085]">
            {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
          </p>
        ) : null}
      </div>
      <AdminMemberPager page={page} hasNext={hasNext} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}
