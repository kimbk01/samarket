/** 관리자 UI — 하단 탭 스타일 preset 값 (라벨은 `admin-menus` 카탈로그 + `bottomNavPresetLabelKey`) */

export type MainBottomNavPresetOption = { value: string };

export const MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "font-sans" },
  { value: "font-serif" },
  { value: "font-mono" },
];

export const MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "sam-text-xxs" },
  { value: "text-xs" },
  { value: "text-sm" },
];

export const MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "font-medium text-signature" },
  { value: "font-semibold text-signature" },
  { value: "font-medium text-gray-900" },
  { value: "font-semibold text-gray-900" },
  { value: "font-medium text-emerald-600" },
  { value: "font-medium text-sam-primary" },
  { value: "font-medium text-rose-600" },
];

export const MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "text-[#999999]" },
  { value: "text-gray-400" },
  { value: "text-gray-500" },
  { value: "text-gray-600" },
];

export const MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "text-signature" },
  { value: "text-gray-900" },
  { value: "text-emerald-600" },
  { value: "text-sam-primary" },
];

export const MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS: MainBottomNavPresetOption[] = [
  { value: "" },
  { value: "text-gray-300" },
  { value: "text-gray-400" },
  { value: "text-gray-500" },
];
