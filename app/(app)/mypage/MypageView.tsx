"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types/profile";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { MyPageHeader } from "@/components/mypage/MyPageHeader";
import { ProfileCard } from "@/components/mypage/ProfileCard";
import { KamarketPayCard } from "@/components/mypage/KamarketPayCard";
import { ServiceGrid } from "@/components/mypage/ServiceGrid";
import { SummaryMenu } from "@/components/mypage/SummaryMenu";
import { MyStoreCommerceSection } from "@/components/mypage/MyStoreCommerceSection";
import { MyOrderRelatedSection } from "@/components/my/MyOrderRelatedSection";
import { MyStoreOrdersHomePreview } from "@/components/my/MyStoreOrdersHomePreview";
import { MyTradeSection } from "@/components/mypage/MyTradeSection";
import { MyInterestSection } from "@/components/mypage/MyInterestSection";
import { MyActivitySection } from "@/components/mypage/MyActivitySection";
import { MyBusinessSection } from "@/components/mypage/MyBusinessSection";
import { MyTestLoginSection } from "@/components/my/MyTestLoginSection";

export function MypageView() {
  const [user, setUser] = useState<Profile | null>(() => getHydrationSafeCurrentUser());

  useEffect(() => {
    const sync = () => setUser(getCurrentUser());
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  const { count: favoriteCount } = useMyFavoriteCount();

  return (
    <>
      <MyPageHeader />
      <div className="space-y-4 px-4">
        <MyTestLoginSection />
        <ProfileCard profile={user} />
        <MyStoreOrdersHomePreview enabled={user != null} />
        <KamarketPayCard />
        <ServiceGrid />
        <SummaryMenu favoriteCount={favoriteCount} />
        <MyStoreCommerceSection />
        <MyOrderRelatedSection />
        <MyTradeSection />
        <MyInterestSection favoriteCount={favoriteCount} />
        <MyActivitySection />
        <MyBusinessSection />
      </div>
    </>
  );
}
