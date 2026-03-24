/**
 * 내정보 > 설정 값 (localStorage, Supabase 연동 시 교체)
 */
const KEY = "kasama_mypage_settings";

export interface MypageSettings {
  language: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  version: string;
  chatNotification: boolean;
  keywordNotification: boolean;
  communityNotification: boolean;
  adNotification: boolean;
  autoplay: boolean;
}

const DEFAULT: MypageSettings = {
  language: "한국어",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  version: "1.0.0",
  chatNotification: true,
  keywordNotification: true,
  communityNotification: true,
  adNotification: false,
  autoplay: true,
};

export function getMypageSettings(): MypageSettings {
  const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
  if (!raw) return { ...DEFAULT };
  try {
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function setMypageSettings(partial: Partial<MypageSettings>): MypageSettings {
  const next = { ...getMypageSettings(), ...partial };
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function getDefaultMypageSettings(): MypageSettings {
  return { ...DEFAULT };
}
