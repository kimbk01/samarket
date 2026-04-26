"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import Link from "next/link";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import {
  MYPAGE_MOBILE_NAV,
  MYPAGE_PROFILE_EDIT_HREF,
  buildMypageSectionHref,
} from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveUnifiedChatUnreadHintForDashboard } from "@/lib/notifications/samarket-messenger-notification-regulations";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import {
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FEED_INSET_X_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";

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
  homeDashboardCounts = null,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
  /** From RSC — skips client list fetches for order/post counts. */
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
}) {
  const { count: favoriteCount } = useMyFavoriteCount();
  const ownerHub = useOwnerHubBadgeBreakdown();
  const [orderCount, setOrderCount] = useState<number | null>(() => homeDashboardCounts?.storeOrderCount ?? null);
  const [postCount, setPostCount] = useState<number | null>(() => homeDashboardCounts?.communityPostCount ?? null);
  const representativeAddress = useRepresentativeAddressLine();

  const viewerId = profile.id?.trim() ?? "";

  /** RSC counts when present; otherwise capped list endpoints as fallback. */
  useEffect(() => {
    if (!viewerId) {
      setOrderCount(null);
      setPostCount(null);
      return;
    }
    if (homeDashboardCounts != null) {
      setOrderCount(homeDashboardCounts.storeOrderCount);
      setPostCount(homeDashboardCounts.communityPostCount);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [ordersWrapped, postsRes] = await Promise.all([
          fetchMeStoreOrdersListDeduped("?limit=100"),
          runSingleFlight("me:community-posts:limit=20", () =>
            fetch("/api/me/community-posts?limit=20", { credentials: "include", cache: "no-store" })
          ),
        ]);
        const oj =
          ordersWrapped.status >= 200 && ordersWrapped.status < 300
            ? (ordersWrapped.json as { ok?: boolean; orders?: unknown[] })
            : null;
        const pj = postsRes.ok ? ((await postsRes.json()) as { ok?: boolean; posts?: unknown[] }) : null;
        if (cancelled) return;
        setOrderCount(Array.isArray(oj?.orders) ? oj.orders.length : 0);
        const plen = Array.isArray(pj?.posts) ? pj.posts.length : 0;
        setPostCount(plen);
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
  }, [viewerId, homeDashboardCounts]);

  const profileRegionLine = resolveProfileLocationAddressLines(profile).join(" · ").trim();
  const representativeRegionLine =
    representativeAddress.status === "ready" ? (representativeAddress.line ?? "").trim() : "";
  const regionLine =
    profileRegionLine ||
    representativeRegionLine ||
    (representativeAddress.status === "loading" ? "대표 주소를 확인하는 중입니다" : "대표 지역을 설정해 주세요");
  const displayName = profile.nickname?.trim() || "닉네임 없음";

  const statRows = useMemo((): { label: string; value: string; href: string }[] => {
    const activeTrade =
      overviewCounts.purchases != null && overviewCounts.sales != null
        ? Math.max(0, overviewCounts.purchases) + Math.max(0, overviewCounts.sales)
        : null;
    return [
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
        value: formatCount(resolveUnifiedChatUnreadHintForDashboard(ownerHub)),
        href: buildMypageSectionHref("messenger"),
      },
      {
        label: "찜",
        value: formatCount(favoriteCount ?? null),
        href: "/mypage/section/trade/favorites",
      },
      {
        label: "내가 쓴 글",
        value: formatCount(postCount),
        href: "/mypage/section/community/posts",
      },
    ];
  }, [
    overviewCounts.purchases,
    overviewCounts.sales,
    orderCount,
    postCount,
    favoriteCount,
    ownerHub.communityMessengerUnread,
    ownerHub.chatUnread,
  ]);

  /** 거래 홈 `HomeProductList` — `PHILIFE_FEED_INSET_X` + 카드 간 `gap-1` 과 동일 축 */
  return (
    <div className={`min-h-0 min-w-0 flex-1 ${PHILIFE_FEED_INSET_X_CLASS} pt-1 pb-1`}>
      {showBanner && bannerSlot ? <div className="mb-1 shrink-0">{bannerSlot}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <article className={`${PHILIFE_FB_CARD_CLASS} w-full min-w-0`}>
          <div className="flex items-start gap-3 sam-card-pad">
            <Link
              href={MYPAGE_PROFILE_EDIT_HREF}
              className="relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-sam-primary-soft"
              aria-label="프로필 이미지"
            >
              <Image src={withDefaultAvatar(profile.avatar_url)} alt="" fill className="object-cover" sizes="72px" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="sam-text-profile-display leading-tight">{displayName}</p>
              <p className="mt-1 sam-text-helper text-sam-muted">{regionLine}</p>
              <div className="mt-2">
                <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
              </div>
              <Link
                href={MYPAGE_PROFILE_EDIT_HREF}
                className="sam-btn sam-btn--outline sam-btn--sm mt-3"
              >
                프로필 수정
              </Link>
            </div>
          </div>
        </article>

        <h2 className="sam-text-section-title text-sam-fg pt-1">상태 요약</h2>
        <div className="flex flex-col gap-1">
          {statRows.map((row) => (
            <Link
              key={row.label}
              href={row.href}
              className={`block w-full min-w-0 no-underline ${PHILIFE_FB_CARD_CLASS} transition-colors active:bg-sam-surface-muted`}
            >
              <div className="flex min-h-[52px] items-center justify-between sam-card-pad sam-text-body">
                <span className="font-medium text-sam-fg">{row.label}</span>
                <span className="tabular-nums text-sam-muted">{row.value}</span>
              </div>
            </Link>
          ))}
        </div>

        <h2 className="sam-text-section-title text-sam-fg pt-2">메뉴</h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {MYPAGE_MOBILE_NAV.map((sec) => (
            <li key={sec.id} className="list-none">
              <MyPageMobileMenuRow
                href={buildMypageSectionHref(sec.id)}
                title={sec.label}
                surface="card"
              />
            </li>
          ))}
          <MyPageAdminMenuEntry asListItem />
          <li className="list-none">
            <LogoutActionTrigger variant="menu_row" surface="card" />
          </li>
        </ul>
      </div>
    </div>
  );
}

