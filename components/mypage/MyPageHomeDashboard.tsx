"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import {
  MYPAGE_MOBILE_NAV,
  MYPAGE_PROFILE_EDIT_HREF,
  buildMypageItemHref,
  buildMypageSectionHref,
} from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

function formatCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n > 99) return "99+";
  return String(n);
}

export function MyPageHomeDashboard({
  profile,
  mannerScore,
  overviewCounts,
  showBanner,
  bannerSlot,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
}) {
  const { count: favoriteCount } = useMyFavoriteCount();
  const { socialChatUnread, storeOrderChatUnread } = useOwnerHubBadgeBreakdown();
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [postCount, setPostCount] = useState<number | null>(null);

  const viewerId = profile.id?.trim() ?? "";

  useEffect(() => {
    if (!viewerId) {
      setOrderCount(null);
      setPostCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [ordersRes, postsRes] = await Promise.all([
          fetch("/api/me/store-orders?limit=200", { credentials: "include", cache: "no-store" }),
          fetch("/api/me/community-posts?limit=50", { credentials: "include", cache: "no-store" }),
        ]);
        const oj = ordersRes.ok ? ((await ordersRes.json()) as { ok?: boolean; orders?: unknown[] }) : null;
        const pj = postsRes.ok ? ((await postsRes.json()) as { ok?: boolean; posts?: unknown[] }) : null;
        if (cancelled) return;
        setOrderCount(Array.isArray(oj?.orders) ? oj.orders.length : 0);
        const plen = Array.isArray(pj?.posts) ? pj.posts.length : 0;
        setPostCount(plen >= 50 ? 50 : plen);
      } catch {
        if (!cancelled) {
          setOrderCount(null);
          setPostCount(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  const regionLine = resolveProfileLocationAddressLines(profile).join(" · ") || "대표 지역을 설정해 주세요";
  const displayName = profile.nickname?.trim() || "닉네임 없음";

  const activeTrade =
    overviewCounts.purchases != null && overviewCounts.sales != null
      ? Math.max(0, overviewCounts.purchases) + Math.max(0, overviewCounts.sales)
      : null;
  const chatUnread = socialChatUnread + storeOrderChatUnread;

  const statRows: { label: string; value: string; href: string }[] = [
    {
      label: "진행중 거래",
      value: formatCount(activeTrade),
      href: buildMypageSectionHref("trade"),
    },
    {
      label: "주문",
      value: formatCount(orderCount),
      href: buildMypageSectionHref("store"),
    },
    {
      label: "안읽은 채팅",
      value: formatCount(chatUnread),
      href: buildMypageSectionHref("messenger"),
    },
    {
      label: "찜",
      value: formatCount(favoriteCount ?? null),
      href: "/mypage/section/trade/favorites",
    },
    {
      label: "내가 쓴 글",
      value: postCount != null ? (postCount >= 50 ? "50+" : String(postCount)) : "—",
      href: "/mypage/section/community/posts",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showBanner && bannerSlot ? <div className={`shrink-0 ${APP_MAIN_GUTTER_X_CLASS} pt-4`}>{bannerSlot}</div> : null}

      <section className={`${APP_MAIN_GUTTER_X_CLASS} pt-4`}>
        <div className="flex items-start gap-3 rounded-ui-rect border border-gray-200 bg-white p-4">
          <Link
            href={MYPAGE_PROFILE_EDIT_HREF}
            className="relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-ig-highlight"
            aria-label="프로필 이미지"
          >
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="72px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted">
                <UserPlaceholderIcon />
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-bold leading-tight text-gray-900">{displayName}</p>
            <p className="mt-1 text-[12px] text-gray-500">{regionLine}</p>
            <div className="mt-2">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
            <Link
              href={MYPAGE_PROFILE_EDIT_HREF}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-ui-rect border border-gray-200 px-3 text-[14px] font-medium text-gray-800 hover:bg-gray-50"
            >
              프로필 수정
            </Link>
          </div>
        </div>
      </section>

      <section className={`${APP_MAIN_GUTTER_X_CLASS} mt-5`}>
        <h2 className="mb-2 text-[14px] font-semibold text-gray-500">상태 요약</h2>
        <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          {statRows.map((row) => (
            <Link
              key={row.label}
              href={row.href}
              className="flex min-h-[48px] items-center justify-between border-b border-gray-100 px-4 py-3 text-[14px] last:border-b-0 active:bg-gray-50"
            >
              <span className="font-medium text-gray-800">{row.label}</span>
              <span className="tabular-nums text-gray-600">{row.value}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${APP_MAIN_GUTTER_X_CLASS} mt-6 pb-6`}>
        <h2 className="mb-2 text-[14px] font-semibold text-gray-500">메뉴</h2>
        <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          {MYPAGE_MOBILE_NAV.map((sec) => (
            <MyPageMobileMenuRow key={sec.id} href={buildMypageSectionHref(sec.id)} title={sec.label} />
          ))}
        </div>
        <div className="mt-3 overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          <MyPageMobileMenuRow
            href={buildMypageItemHref("settings", "logout")}
            title="로그아웃"
            tone="danger"
          />
        </div>
      </section>
    </div>
  );
}

function UserPlaceholderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}
