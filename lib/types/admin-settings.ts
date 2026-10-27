/**
 * 17단계: 관리자 운영설정 타입
 */

export interface AppSettings {
  siteName: string;
  defaultCurrency: string;
  defaultLocale: string;
  /** 알람 사운드 (MP3) - Data URL 또는 URL. 관리자 일반설정에서 등록 */
  alarmSoundDataUrl: string;
  productAutoExpireDays: number;
  maxProductImages: number;
  allowPriceOffer: boolean;
  allowProductBoost: boolean;
  boostCooldownHours: number;
  chatEnabled: boolean;
  allowChatAfterSold: boolean;
  maxMessageLength: number;
  reportEnabled: boolean;
  maxReportsPerTarget: number;
  trustReviewEnabled: boolean;
  mannerScoreVisible: boolean;
  /** 프로필 배터리 표시 라벨 (기본: 배터리) */
  speedDisplayLabel: string;
  regionMultiSelectEnabled: boolean;
  maxSavedRegions: number;
  homeRadiusKm: number;
  /** 거래 D (Owner 2026-10-28): 거래 반경 선택지(km). 「전체」는 항상 별도. 초깃값 10·20·40 */
  tradeRadiusOptionsKm: number[];
  /** 거래 D: 📍 시트에서 새 지역을 고를 때 미리 고르는 반경(km). null = 「전체」 */
  tradeDefaultRadiusKm: number | null;
  updatedAt: string;
}

export interface SettingChangeLog {
  id: string;
  key: string;
  oldValue: string;
  newValue: string;
  adminId: string;
  adminNickname: string;
  createdAt: string;
  note?: string;
}
