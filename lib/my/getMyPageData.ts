"use client";

/**
 * 나의 카마켓 메인 한 번에 로드
 * - profile, banner(닫기 여부 반영), services, sections
 * - Supabase: my_page_banners, my_services, my_page_sections
 */
import type { MyPageData } from "./types";
import { defaultMypageCmsPack, loadMypageCmsPack } from "@/lib/my/load-mypage-cms-pack";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { fetchMeHasOwnerStores } from "@/lib/my/fetch-me-has-owner-stores";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { getMySettings } from "./getMySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";

export async function getMyPageData(): Promise<MyPageData> {
  const user = getCurrentUser();
  const userId = user?.id ?? null;
  const settings = userId ? getMySettings(userId) : {};
  const bannerHidden = settings.app_banner_hidden === true;

  const [profile, hasOwnerStore] = await Promise.all([
    getMyProfile(),
    fetchMeHasOwnerStores(),
  ]);

  const cmsFallback = defaultMypageCmsPack();
  let banner = cmsFallback.banner;
  let services = cmsFallback.services;
  let sections = cmsFallback.sections;

  const supabase = getSupabaseClient();
  if (supabase) {
    const cmsPack = await loadMypageCmsPack(supabase, { includeBanner: !bannerHidden });
    banner = cmsPack.banner;
    services = cmsPack.services;
    sections = cmsPack.sections;
  }

  const uid = profile?.id ?? userId ?? "";
  const trustSummary = uid ? getTrustSummary(uid) : null;
  let mannerScore = profile
    ? resolveProfileTrustScore(profile as unknown as Record<string, unknown>)
    : (trustSummary?.mannerScore ?? 50);
  if (supabase && uid) {
    try {
      const { data: snap } = await supabase
        .from("member_trust_snapshots")
        .select("manner_battery_percent")
        .eq("member_id", uid)
        .maybeSingle();
      const pct = (snap as { manner_battery_percent?: number } | null)?.manner_battery_percent;
      if (pct != null && Number.isFinite(Number(pct))) {
        mannerScore = Number(pct);
      }
    } catch {
      /* keep bridge */
    }
  }
  const isBusinessMember = hasOwnerStore;
  const isAdmin = isAdminUser(user);

  return {
    profile,
    banner,
    bannerHidden,
    services: services.filter((s) => !s.admin_only || isAdmin),
    sections,
    mannerScore,
    isBusinessMember,
    isAdmin,
    hasOwnerStore,
  };
}
