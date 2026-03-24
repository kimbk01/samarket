/**
 * 나의 카마켓 메인·설정·어드민 공통 타입
 * Supabase: profiles, user_settings, my_page_banners, my_services, my_page_sections 등
 */

import type { ProfileRow } from "@/lib/profile/types";
import type { UserSettingsRow } from "@/lib/types/settings-db";

/** my_page_banners */
export interface MyPageBannerRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  dismissible: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** my_services (서비스 그리드 2x4) */
export interface MyServiceRow {
  code: string;
  label: string;
  icon_key: string;
  href: string;
  is_active: boolean;
  sort_order: number;
  admin_only: boolean;
  country_code: string | null;
}

/** my_page_sections (나의 거래/관심/활동/비즈니스 섹션 노출) */
export interface MyPageSectionRow {
  section_key: string;
  title: string;
  is_active: boolean;
  sort_order: number;
}

/** 나의 카마켓 메인 한 번에 로드할 데이터 */
export interface MyPageData {
  profile: ProfileRow | null;
  banner: MyPageBannerRow | null;
  bannerHidden: boolean;
  services: MyServiceRow[];
  sections: MyPageSectionRow[];
  /** 매너/신뢰도 (프로필에 없을 때 fallback) */
  mannerScore: number;
  isBusinessMember: boolean;
  /** 플랫폼 관리자 — `NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL`·테스트 role 등 */
  isAdmin: boolean;
  /** 내 매장(`/api/me/stores`) 1건 이상 — 매장 관리자 접속 노출 */
  hasOwnerStore: boolean;
}

/** 설정 화면용 설정 타입 (user_settings 호환) */
export type MySettings = Partial<UserSettingsRow>;
