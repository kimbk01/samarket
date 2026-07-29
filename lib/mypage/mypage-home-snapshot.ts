/**
 * `/mypage` root — lightweight session snapshot (no full MyPageData, no PII dump).
 * DO NOT: localStorage full profile / phone / address text.
 */

export type RequiredInfoStatus = "unknown" | "complete" | "required";

export const MYPAGE_HOME_SESSION_KEY = "samarket:mypage-home:v1";
/** Legacy keys — wipe on read/write and logout. */
export const MYPAGE_HUB_SESSION_LEGACY_KEY = "samarket:mypage-hub:v1";
export const MYPAGE_HUB_PERSISTENT_LEGACY_KEY = "samarket:mypage-hub:v2_persistent";

const MYPAGE_HOME_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export type MypageHomeSessionLite = {
  viewerId: string;
  displayName: string;
  avatarUrl: string | null;
  username: string | null;
  bio: string | null;
  profileUpdatedAt: string | null;
  hasDibayId: boolean;
  phoneStatus: RequiredInfoStatus;
  addressStatus: RequiredInfoStatus;
  savedAt: number;
};

export function clearMypageHomeCaches(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MYPAGE_HOME_SESSION_KEY);
    sessionStorage.removeItem(MYPAGE_HUB_SESSION_LEGACY_KEY);
    localStorage.removeItem(MYPAGE_HUB_PERSISTENT_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function peekMypageHomeSessionLite(viewerId: string): MypageHomeSessionLite | null {
  if (typeof window === "undefined") return null;
  const uid = viewerId.trim();
  if (!uid) return null;
  try {
    /* migrate away: drop legacy full-data caches */
    localStorage.removeItem(MYPAGE_HUB_PERSISTENT_LEGACY_KEY);
    sessionStorage.removeItem(MYPAGE_HUB_SESSION_LEGACY_KEY);

    const raw = sessionStorage.getItem(MYPAGE_HOME_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MypageHomeSessionLite;
    if ((parsed.viewerId ?? "").trim() !== uid) return null;
    const savedAt = Number(parsed.savedAt ?? 0);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MYPAGE_HOME_SESSION_MAX_AGE_MS) {
      sessionStorage.removeItem(MYPAGE_HOME_SESSION_KEY);
      return null;
    }
    if (typeof parsed.displayName !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMypageHomeSessionLite(lite: MypageHomeSessionLite): void {
  if (typeof window === "undefined") return;
  const uid = lite.viewerId.trim();
  if (!uid) return;
  try {
    localStorage.removeItem(MYPAGE_HUB_PERSISTENT_LEGACY_KEY);
    sessionStorage.removeItem(MYPAGE_HUB_SESSION_LEGACY_KEY);
    const payload: MypageHomeSessionLite = {
      ...lite,
      viewerId: uid,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(MYPAGE_HOME_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota/private */
  }
}
