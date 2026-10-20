"use client";

import { useEffect, useState } from "react";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MY_PAGE_BANNERS_SELECT } from "@/lib/my/mypage-tables-select";
import type { MyPageBannerRow } from "@/lib/my/types";
import {
  isMypageBannerDismissed,
  rememberMypageBannerDismissed,
} from "@/lib/mypage/mypage-banner-dismissed";

/**
 * 내정보 홈 CMS 배너 (v2.1 PR-2c · §6) — 관리자 `my_page_banners` 활성 1건을 프로필 아래에 표시.
 * 첫 화면을 기다리게 하지 않도록 마운트 후 조회하고, 배너가 없으면 자리를 만들지 않는다.
 * 닫은 배너는 배너 id 단위로 기기에 저장 — 새 배너는 다시 보인다.
 */
export function MypageHomeCmsBanner() {
  const [banner, setBanner] = useState<MyPageBannerRow | null>(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    void sb
      .from("my_page_banners")
      .select(MY_PAGE_BANNERS_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const row = data as MyPageBannerRow;
        if (row.dismissible && isMypageBannerDismissed(row.id)) return;
        setBanner(row);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner) return null;
  return (
    <MyTopBanner
      banner={banner}
      onDismiss={() => {
        rememberMypageBannerDismissed(banner.id);
        setBanner(null);
      }}
    />
  );
}
