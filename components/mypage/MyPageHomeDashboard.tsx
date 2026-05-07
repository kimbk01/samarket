"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import {
  MYPAGE_MOBILE_NAV,
  MYPAGE_PROFILE_EDIT_HREF,
  buildMypageSectionHref,
} from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveUnifiedChatUnreadHintForDashboard } from "@/lib/notifications/samarket-messenger-notification-regulations";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import {
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FEED_INSET_X_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { MyInfoProfileCard } from "@/components/mypage/myinfo/MyInfoProfileCard";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  Globe,
  Heart,
  HelpCircle,
  Languages,
  MapPin,
  MessageCircle,
  Package,
  ReceiptText,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { MYINFO_SURFACE } from "@/components/mypage/myinfo/myinfo-theme";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";

function formatCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n > 99) return "99+";
  return String(n);
}

function icon(el: ReactNode) {
  return el;
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
  const countsFetchScheduledRef = useRef(false);

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
    if (countsFetchScheduledRef.current) return;
    countsFetchScheduledRef.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        dibayMyInfoPerfMark("api_start_ms", { api: "mypage_home_counts_fallback" });
        const [ordersWrapped, postsRes] = await Promise.all([
          fetchMeStoreOrdersListDeduped("?limit=100"),
          runSingleFlight("me:community-posts:limit=20", () =>
            fetch("/api/me/community-posts?limit=20", { credentials: "include", cache: "no-store" })
          ),
        ]);
        dibayMyInfoPerfMark("api_done_ms", { api: "mypage_home_counts_fallback" });
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
    };

    /**
     * MI2: fallback count fetch must not compete with first visible paint.
     * - schedule after hydration on an idle slice (or short delay fallback)
     * - failure must never block UI
     */
    const schedule = () => {
      if (cancelled) return;
      void run();
    };

    const w = typeof window !== "undefined" ? (window as any) : null;
    const idle: ((cb: () => void, opts?: { timeout?: number }) => number) | null =
      w && typeof w.requestIdleCallback === "function" ? w.requestIdleCallback.bind(w) : null;
    const cancelIdle: ((id: number) => void) | null =
      w && typeof w.cancelIdleCallback === "function" ? w.cancelIdleCallback.bind(w) : null;

    let idleId: number | null = null;
    let t: ReturnType<typeof setTimeout> | null = null;

    if (idle) {
      idleId = idle(schedule, { timeout: 1200 });
    } else {
      t = setTimeout(schedule, 350);
    }

    return () => {
      cancelled = true;
      if (idleId != null && cancelIdle) cancelIdle(idleId);
      if (t) clearTimeout(t);
    };
  }, [viewerId, homeDashboardCounts]);

  useEffect(() => {
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, []);

  const profileRegionLine = resolveProfileLocationAddressLines(profile).join(" · ").trim();
  const representativeRegionLine =
    representativeAddress.status === "ready" ? (representativeAddress.line ?? "").trim() : "";
  const regionLine =
    profileRegionLine ||
    representativeRegionLine ||
    (representativeAddress.status === "loading" ? "대표 주소를 확인하는 중입니다" : "대표 지역을 설정해 주세요");
  const displayName = resolveDisplayName(profile) || "닉네임 없음";
  const atUsername = formatAtUsername(profile.username ?? null);

  const statRows = useMemo((): { label: string; value: string; href: string; accent?: boolean }[] => {
    const activeTrade =
      overviewCounts.purchases != null && overviewCounts.sales != null
        ? Math.max(0, overviewCounts.purchases) + Math.max(0, overviewCounts.sales)
        : null;
    return [
      {
        label: "포인트",
        value: profile.points != null ? String(profile.points) : "—",
        href: "/mypage/points",
        accent: true,
      },
      {
        label: "진행중 거래",
        value: formatCount(activeTrade),
        href: buildMypageSectionHref("trade"),
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
    ];
  }, [
    overviewCounts.purchases,
    overviewCounts.sales,
    orderCount,
    postCount,
    favoriteCount,
    ownerHub,
    profile.points,
  ]);

  /** 거래 홈 `HomeProductList` — `PHILIFE_FEED_INSET_X` + 카드 간 `gap-1` 과 동일 축 */
  return (
    <div className={`min-h-0 min-w-0 flex-1 ${PHILIFE_FEED_INSET_X_CLASS} pt-1 pb-1`}>
      {showBanner && bannerSlot ? <div className="mb-1 shrink-0">{bannerSlot}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <MyInfoProfileCard
          avatarUrl={profile.avatar_url}
          displayName={displayName}
          atUsername={atUsername}
          addressLine={regionLine}
          editHref={MYPAGE_PROFILE_EDIT_HREF}
          rightMetaSlot={
            <div className="pt-1">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          }
        />

        <MyInfoStatGrid title="요약" items={statRows} />

        <div className="space-y-4">
          <MyInfoMenuSection title="거래">
            <MyInfoMenuItem
              href="/mypage/section/trade/sales"
              title="진행중 거래"
              description="판매·구매 내역과 거래 상태를 확인합니다."
              icon={icon(<Package className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/trade/favorites"
              title="찜"
              description="관심 상품과 다시 보고 싶은 글을 모아봅니다."
              icon={icon(<Heart className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/my/offers"
              title="내 가격 제안"
              description="내가 보낸 가격 제안을 확인합니다."
              icon={icon(<ReceiptText className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title="커뮤니티">
            <MyInfoMenuItem
              href="/mypage/section/community/posts"
              title="내가 쓴 글"
              description="작성한 게시물을 최근순으로 확인합니다."
              icon={icon(<BookOpen className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/community/comments"
              title="댓글/활동"
              description="내가 쓴 댓글과 활동을 확인합니다."
              icon={icon(<MessageCircle className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title="계정">
            <MyInfoMenuItem
              href="/mypage/addresses"
              title="주소관리"
              description="거래·생활·배달 주소를 관리합니다."
              icon={icon(<MapPin className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/store/payment"
              title="결제정보"
              description="결제 및 포인트 정보를 확인합니다."
              icon={icon(<CreditCard className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/device-permissions"
              title="개인/보안"
              description="기기 권한과 보안 설정을 확인합니다."
              icon={icon(<Shield className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notifications"
              title="알림"
              description="서비스·채팅 알림 설정을 관리합니다."
              icon={icon(<Bell className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/language"
              title="언어 Language"
              description="언어 설정을 변경합니다."
              icon={icon(<Languages className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/country"
              title="지역/국가"
              description="국가 설정을 변경합니다."
              icon={icon(<Globe className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/settings"
              title="설정"
              description="시스템 및 서비스 설정을 관리합니다."
              icon={icon(<Settings className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyInfoMenuSection title="고객지원">
            <MyInfoMenuItem
              href="/mypage/section/settings/support"
              title="고객센터"
              description="문의 및 도움말을 확인합니다."
              icon={icon(<HelpCircle className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/notices"
              title="공지사항"
              description="운영 공지를 확인합니다."
              icon={icon(<UserRound className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/events"
              title="이벤트"
              description="진행 중인 이벤트를 확인합니다."
              icon={icon(<CalendarDays className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
            <MyInfoMenuItem
              href="/mypage/section/settings/terms"
              title="이용약관"
              description="약관 및 정책을 확인합니다."
              icon={icon(<Shield className="h-[22px] w-[22px]" strokeWidth={2} />)}
            />
          </MyInfoMenuSection>

          <MyPageAdminMenuEntry asListItem />

          <div className="pt-2">
            <div className={`${MYINFO_SURFACE.card} overflow-hidden`}>
              <LogoutActionTrigger variant="menu_row" surface="grouped" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

