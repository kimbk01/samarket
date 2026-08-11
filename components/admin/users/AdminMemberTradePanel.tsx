"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberMetricGrid, AdminMemberPager } from "@/components/admin/users/AdminMemberMetricGrid";
import {
  memberTradeAdminHref,
  memberTradeChatAdminHref,
  memberTradePostHref,
} from "@/lib/admin-users/member-deep-links";
import type { MemberTradeSection, MemberTradeTabPayload } from "@/lib/admin-users/member-trade-tab";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

export function AdminMemberTradePanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const [section, setSection] = useState<MemberTradeSection>("listings");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberTradeTabPayload }>({
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
        const qs = new URLSearchParams({ section, page: String(page), pageSize: "10" });
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/trade?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as MemberTradeTabPayload & { ok?: boolean };
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
  }, [userId, section, page]);

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

  const { summary, total } = state.data;
  const hasNext = total.ok && page * 10 < total.value;

  return (
    <div className="space-y-4">
      <AdminMemberMetricGrid
        items={[
          { label: t("admin_users_cc_overview_listings"), metric: summary.listings },
          { label: t("admin_users_cc_overview_selling"), metric: summary.selling },
          { label: t("admin_users_cc_overview_reserved"), metric: summary.reserved },
          { label: t("admin_users_cc_overview_completed"), metric: summary.completed },
          {
            label: safeT("admin_users_cc_summary_buyer", { fallbackKo: "구매 참여", fallbackEn: "Buyer chats" }),
            metric: summary.buyerChats,
          },
          {
            label: safeT("admin_users_cc_summary_trade_chats", { fallbackKo: "거래 채팅", fallbackEn: "Trade chats" }),
            metric: summary.tradeChats,
          },
          {
            label: t("admin_users_cc_overview_last_post"),
            metric: summary.lastListingAt,
            format: (value) => fmt(typeof value === "string" ? value : null),
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSection("listings");
            setPage(1);
          }}
          className={
            section === "listings"
              ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
              : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085]"
          }
        >
          {t("admin_users_cc_overview_listings")}
        </button>
        <button
          type="button"
          onClick={() => {
            setSection("buyer");
            setPage(1);
          }}
          className={
            section === "buyer"
              ? "rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
              : "rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085]"
          }
        >
          {safeT("admin_users_cc_summary_buyer", { fallbackKo: "구매 참여", fallbackEn: "Buyer chats" })}
        </button>
        <Link href={memberTradeAdminHref()} className="ml-auto text-xs font-semibold text-[#2563eb]">
          {safeT("admin_users_cc_cta_open_trade_admin", { fallbackKo: "Trade Admin에서 열기", fallbackEn: "Open in Trade admin" })}
        </Link>
      </div>
      <div className={`${ADMIN_USERS_LITE_CARD} divide-y divide-[#eaecf0]`}>
        {section === "listings"
          ? state.data.listings.map((row) => (
              <div key={row.id} className="space-y-1 px-4 py-3">
                <p className="text-sm font-semibold text-[#101828]">{row.title || row.id}</p>
                <p className="text-xs text-[#667085]">
                  {row.listingState || row.status} · {row.price == null ? "—" : row.price.toLocaleString()} · {fmt(row.createdAt)}
                </p>
                <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
                  <Link href={memberTradePostHref(row.id)}>
                    {safeT("admin_users_cc_cta_view_trade_post", { fallbackKo: "거래 게시물 보기", fallbackEn: "View listing" })}
                  </Link>
                  <Link href={memberTradeChatAdminHref()}>
                    {safeT("admin_users_cc_cta_view_trade_chat", { fallbackKo: "Trade 채팅 보기", fallbackEn: "View trade chat" })}
                  </Link>
                </div>
              </div>
            ))
          : state.data.buyer.map((row) => (
              <div key={row.id} className="space-y-1 px-4 py-3">
                <p className="text-sm font-semibold text-[#101828]">{row.postTitle || row.postId}</p>
                <p className="text-xs text-[#667085]">{row.tradeFlowStatus || "—"}</p>
                <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#2563eb]">
                  {row.postId ? (
                    <Link href={memberTradePostHref(row.postId)}>
                      {safeT("admin_users_cc_cta_view_trade_post", { fallbackKo: "거래 게시물 보기", fallbackEn: "View listing" })}
                    </Link>
                  ) : null}
                  <Link href={memberTradeChatAdminHref()}>
                    {safeT("admin_users_cc_cta_view_trade_chat", { fallbackKo: "Trade 채팅 보기", fallbackEn: "View trade chat" })}
                  </Link>
                </div>
              </div>
            ))}
        {(section === "listings" && state.data.listings.length === 0) || (section === "buyer" && state.data.buyer.length === 0) ? (
          <p className="px-4 py-6 text-center text-sm text-[#667085]">
            {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
          </p>
        ) : null}
      </div>
      <AdminMemberPager page={page} hasNext={hasNext} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}
