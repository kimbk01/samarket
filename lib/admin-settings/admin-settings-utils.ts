/**
 * 17단계: 운영설정 기본값·섹션 키
 */

import type { AppSettings } from "@/lib/types/admin-settings";

/** 기본 로케일 옵션: 필리핀 / 한국 (기본: 필리핀) */
export const DEFAULT_LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "en-PH", label: "필리핀" },
  { value: "ko-KR", label: "한국" },
];

/** 기본 통화 옵션: 페소 / 원화 (기본: 페소) */
export const DEFAULT_CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "PHP", label: "페소" },
  { value: "KRW", label: "원화" },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  siteName: "KASAMA",
  defaultCurrency: "PHP",
  defaultLocale: "en-PH",
  alarmSoundDataUrl: "",
  productAutoExpireDays: 90,
  maxProductImages: 10,
  allowPriceOffer: true,
  allowProductBoost: true,
  boostCooldownHours: 24,
  chatEnabled: true,
  allowChatAfterSold: false,
  maxMessageLength: 1000,
  reportEnabled: true,
  maxReportsPerTarget: 5,
  trustReviewEnabled: true,
  mannerScoreVisible: true,
  speedDisplayLabel: "배터리",
  regionMultiSelectEnabled: true,
  maxSavedRegions: 2,
  homeRadiusKm: 5,
  updatedAt: new Date().toISOString(),
};

export type SettingsSectionKey =
  | "general"
  | "product"
  | "chat"
  | "report"
  | "trust"
  | "region"
  | "categories";

export const SETTINGS_SECTIONS: { key: SettingsSectionKey; label: string }[] = [
  { key: "general", label: "일반 설정" },
  { key: "product", label: "상품 정책" },
  { key: "chat", label: "채팅 정책" },
  { key: "report", label: "신고 정책" },
  { key: "trust", label: "후기/신뢰도 정책" },
  { key: "region", label: "지역/노출 정책" },
  { key: "categories", label: "카테고리 관리" },
];

/** 섹션별 설정 키 (저장/초기화 시 사용). categories는 AppSettings에 없음. */
export const SECTION_KEYS: Record<SettingsSectionKey, (keyof AppSettings)[]> = {
  general: ["siteName", "defaultCurrency", "defaultLocale", "alarmSoundDataUrl"],
  product: [
    "productAutoExpireDays",
    "maxProductImages",
    "allowPriceOffer",
    "allowProductBoost",
    "boostCooldownHours",
  ],
  chat: ["chatEnabled", "allowChatAfterSold", "maxMessageLength"],
  report: ["reportEnabled", "maxReportsPerTarget"],
  trust: ["trustReviewEnabled", "mannerScoreVisible", "speedDisplayLabel"],
  region: ["regionMultiSelectEnabled", "maxSavedRegions", "homeRadiusKm"],
  categories: [],
};
