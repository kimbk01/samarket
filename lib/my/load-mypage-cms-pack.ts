import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MY_SECTIONS, DEFAULT_MY_SERVICES } from "@/lib/my/my-page-defaults";
import {
  isMypageCmsKnownUnavailable,
  markMypageCmsAvailable,
  markMypageCmsUnavailable,
} from "@/lib/my/mypage-cms-availability";
import { hasMypageCmsTableMissingError } from "@/lib/my/is-mypage-cms-supabase-error";
import {
  MY_PAGE_BANNERS_SELECT,
  MY_PAGE_SECTIONS_SELECT,
  MY_SERVICES_SELECT,
  MY_PAGE_BANNER_CUSTOMER_ORDER,
  myPageBannerLiveQuerySpec,
} from "@/lib/my/mypage-tables-select";
import type { MyPageBannerRow, MyPageSectionRow, MyServiceRow } from "@/lib/my/types";
import { filterMyPageBannersWithLiveDestination } from "@/lib/my/my-page-banner-destination";
import { MYPAGE_HOME_BANNER_FETCH_LIMIT } from "@/lib/mypage/mypage-home-banner-pick";

export type MypageCmsPack = {
  banner: MyPageBannerRow | null;
  services: MyServiceRow[];
  sections: MyPageSectionRow[];
};

export function defaultMypageCmsPack(): MypageCmsPack {
  return {
    banner: null,
    services: DEFAULT_MY_SERVICES,
    sections: DEFAULT_MY_SECTIONS,
  };
}

type LoadMypageCmsPackOptions = {
  includeBanner?: boolean;
};

export async function loadMypageCmsPack(
  supabase: SupabaseClient,
  options: LoadMypageCmsPackOptions = {},
): Promise<MypageCmsPack> {
  const includeBanner = options.includeBanner !== false;
  const fallback = defaultMypageCmsPack();

  if (isMypageCmsKnownUnavailable()) {
    return fallback;
  }

  try {
    const servicesPromise = supabase
      .from("my_services")
      .select(MY_SERVICES_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const sectionsPromise = supabase
      .from("my_page_sections")
      .select(MY_PAGE_SECTIONS_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (includeBanner) {
      // MB-A03 · MB-C04: 고객 노출 조건·정렬은 공용 정의 1곳(`mypage-tables-select`)
      const live = myPageBannerLiveQuerySpec(new Date().toISOString());
      let bannerQuery = supabase
        .from("my_page_banners")
        .select(MY_PAGE_BANNERS_SELECT)
        .eq(live.activeColumn, live.activeValue)
        .or(live.startOr)
        .or(live.endOr);
      for (const o of MY_PAGE_BANNER_CUSTOMER_ORDER) {
        bannerQuery = bannerQuery.order(o.column, { ascending: o.ascending });
      }
      const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
        bannerQuery.limit(MYPAGE_HOME_BANNER_FETCH_LIMIT),
        servicesPromise,
        sectionsPromise,
      ]);

      if (hasMypageCmsTableMissingError(bannerRes.error, servicesRes.error, sectionsRes.error)) {
        markMypageCmsUnavailable();
        return fallback;
      }

      markMypageCmsAvailable();
      // DS-7: 링크 없음·끝난 이벤트로 가는 배너는 빼고 첫 1건
      const liveBanners = await filterMyPageBannersWithLiveDestination(
        supabase,
        Array.isArray(bannerRes.data) ? (bannerRes.data as MyPageBannerRow[]) : []
      );
      return {
        banner: liveBanners[0] ?? null,
        services: servicesRes.data?.length ? (servicesRes.data as MyServiceRow[]) : fallback.services,
        sections: sectionsRes.data?.length ? (sectionsRes.data as MyPageSectionRow[]) : fallback.sections,
      };
    }

    const [servicesRes, sectionsRes] = await Promise.all([servicesPromise, sectionsPromise]);

    if (hasMypageCmsTableMissingError(servicesRes.error, sectionsRes.error)) {
      markMypageCmsUnavailable();
      return fallback;
    }

    markMypageCmsAvailable();
    return {
      banner: null,
      services: servicesRes.data?.length ? (servicesRes.data as MyServiceRow[]) : fallback.services,
      sections: sectionsRes.data?.length ? (sectionsRes.data as MyPageSectionRow[]) : fallback.sections,
    };
  } catch {
    return fallback;
  }
}
