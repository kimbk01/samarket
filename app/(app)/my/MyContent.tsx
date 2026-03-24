"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getMyPageData } from "@/lib/my/getMyPageData";
import type { MyPageData } from "@/lib/my/types";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { MyProfileCard } from "@/components/my/MyProfileCard";
import { MySafeTradeCard } from "@/components/my/MySafeTradeCard";
import { MyServicesCategoryGrid } from "@/components/my/MyServicesCategoryGrid";
import { MyQuickLinks } from "@/components/my/MyQuickLinks";
import { MySectionList } from "@/components/my/MySectionList";
import { MyTestLoginSection } from "@/components/my/MyTestLoginSection";
import { MyOrderRelatedSection } from "@/components/my/MyOrderRelatedSection";
import { MyStoreOrdersHomePreview } from "@/components/my/MyStoreOrdersHomePreview";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";

export function MyContent() {
  const [data, setData] = useState<MyPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const { count: favoriteCount } = useMyFavoriteCount();
  const notificationUnreadCount = useMyNotificationUnreadCount();

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getMyPageData();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} />
        <div className="mx-auto max-w-[480px] space-y-4 px-4 pt-4 pb-6">
          <MyTestLoginSection />
          <div className="text-center text-[14px] text-gray-500">불러오는 중…</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} />
        <div className="mx-auto max-w-[480px] space-y-4 px-4 pt-4 pb-6">
          <MyTestLoginSection />
          <div className="text-center text-[14px] text-gray-500">로그인이 필요합니다.</div>
        </div>
      </div>
    );
  }

  const {
    profile,
    banner,
    bannerHidden,
    sections,
    mannerScore,
    isBusinessMember,
    isAdmin,
    hasOwnerStore,
  } = data;
  const showBanner = banner && !bannerHidden;

  return (
    <div className="min-h-screen bg-gray-100 pb-6">
      <MyPageHeader notificationUnreadCount={notificationUnreadCount} />
      <div className="mx-auto max-w-[480px] space-y-4 px-4 pt-4">
        <MyTestLoginSection />

        {showBanner && (
          <MyTopBanner banner={banner} onDismiss={load} />
        )}

        {profile && (
          <MyProfileCard
            profile={profile}
            mannerScore={mannerScore}
            isBusinessMember={isBusinessMember}
            accountHref="/my/account"
          />
        )}

        <MyStoreOrdersHomePreview enabled={!!profile} />

        <MySafeTradeCard />

        <MyServicesCategoryGrid />

        <div>
          <h2 className="mb-2 px-1 text-[13px] font-medium text-gray-500">바로가기</h2>
          <MyQuickLinks
            favoriteCount={favoriteCount}
            notificationUnreadCount={notificationUnreadCount}
          />
        </div>

        <MyOrderRelatedSection />

        {sections.length > 0 && (
          <div>
            <h2 className="mb-2 px-1 text-[13px] font-medium text-gray-500">나의 메뉴</h2>
            <MySectionList sections={sections} interestFavoriteCount={favoriteCount} />
          </div>
        )}

        {(isAdmin || hasOwnerStore) && (
          <div className="space-y-2 pt-2">
            {isAdmin ? (
              <Link
                href="/admin"
                className="block rounded-xl bg-white px-4 py-3 text-center text-[14px] font-medium text-signature shadow-sm ring-1 ring-gray-100"
              >
                관리자 접속
              </Link>
            ) : null}
            {hasOwnerStore ? (
              <Link
                href="/my/business"
                className="block rounded-xl bg-white px-4 py-3 text-center text-[14px] font-medium text-gray-900 shadow-sm ring-1 ring-gray-100"
              >
                매장 관리자 접속
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
