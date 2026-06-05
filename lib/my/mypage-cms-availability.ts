const SESSION_UNAVAILABLE_KEY = "samarket:mypage-cms:unavailable:v1";
const UNAVAILABLE_TTL_MS = 5 * 60 * 1000;

type UnavailableCache = { at: number };

let serverMypageCmsUnavailableAt = 0;

function isUnavailableStampFresh(at: number): boolean {
  return Number.isFinite(at) && at > 0 && Date.now() - at < UNAVAILABLE_TTL_MS;
}

export function isMypageCmsKnownUnavailable(): boolean {
  if (isUnavailableStampFresh(serverMypageCmsUnavailableAt)) return true;
  serverMypageCmsUnavailableAt = 0;
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(SESSION_UNAVAILABLE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as UnavailableCache;
    if (!isUnavailableStampFresh(parsed.at)) {
      sessionStorage.removeItem(SESSION_UNAVAILABLE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function markMypageCmsUnavailable(): void {
  const at = Date.now();
  serverMypageCmsUnavailableAt = at;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_UNAVAILABLE_KEY, JSON.stringify({ at }));
  } catch {
    /* quota/private */
  }
}

export function markMypageCmsAvailable(): void {
  serverMypageCmsUnavailableAt = 0;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_UNAVAILABLE_KEY);
  } catch {
    /* quota/private */
  }
}
