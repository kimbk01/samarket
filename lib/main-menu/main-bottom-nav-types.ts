import type { BottomNavIconKey, BottomNavItemConfig, BottomNavTabId } from "@/lib/main-menu/bottom-nav-config";

/** DB·API 페이로드 한 행 (노출 여부 포함) */
export type MainBottomNavStoredItem = {
  id: BottomNavTabId;
  visible: boolean;
  label?: string;
  href?: string;
  icon?: BottomNavIconKey;
  iconSizeClass?: string;
  labelInactiveExtraClass?: string;
  labelActiveExtraClass?: string;
  iconInactiveClass?: string;
  iconActiveClass?: string;
  labelInactiveClass?: string;
  labelActiveClass?: string;
  /** 라벨 기본 크기 덮어쓰기 (예: sam-text-xxs, text-xs) */
  labelSizeClass?: string;
  /** 라벨 폰트 패밀리 (font-sans 등) */
  labelFontFamilyClass?: string;
};

export type MainBottomNavStoredPayload = {
  items: MainBottomNavStoredItem[];
};

/** 관리자 UI용: 표시 + 스타일 편집 */
export type MainBottomNavAdminRow = BottomNavItemConfig & { visible: boolean };
