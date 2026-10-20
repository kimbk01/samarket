/** 내정보 홈 CMS 배너 — 닫은 배너 id 를 기기에 저장 (v2.1 §6). 저장소 접근 실패 시 닫힘 기억 없이 동작 */
const KEY = "samarket:mypage:dismissed-banner-ids";
const MAX_IDS = 20;

function readIds(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function isMypageBannerDismissed(bannerId: string): boolean {
  return readIds().includes(bannerId);
}

export function rememberMypageBannerDismissed(bannerId: string): void {
  try {
    const ids = [bannerId, ...readIds().filter((id) => id !== bannerId)].slice(0, MAX_IDS);
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* 저장 불가 — 이번 화면에서만 숨김 */
  }
}
