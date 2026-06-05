import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MY_SECTIONS, DEFAULT_MY_SERVICES } from "@/lib/my/my-page-defaults";
import {
  isMypageCmsKnownUnavailable,
  markMypageCmsAvailable,
  markMypageCmsUnavailable,
} from "@/lib/my/mypage-cms-availability";
import { hasMypageCmsTableMissingError } from "@/lib/my/is-mypage-cms-supabase-error";
import { MY_PAGE_BANNERS_SELECT, MY_PAGE_SECTIONS_SELECT, MY_SERVICES_SELECT } from "@/lib/my/mypage-tables-select";
import type { MyPageBannerRow, MyPageSectionRow, MyServiceRow } from "@/lib/my/types";

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
      const [bannerRes, servicesRes, sectionsRes] = await Promise.all([
        supabase
          .from("my_page_banners")
          .select(MY_PAGE_BANNERS_SELECT)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
        servicesPromise,
        sectionsPromise,
      ]);

      if (hasMypageCmsTableMissingError(bannerRes.error, servicesRes.error, sectionsRes.error)) {
        markMypageCmsUnavailable();
        return fallback;
      }

      markMypageCmsAvailable();
      return {
        banner: bannerRes.data ? (bannerRes.data as MyPageBannerRow) : null,
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
