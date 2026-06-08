/**
 * Community Messenger 진단 로그·루프 게이트 (기본 꺼짐).
 *
 * | 플래그 | 켜는 방법 |
 * |--------|-----------|
 * | DEBUG_MESSENGER | `NEXT_PUBLIC_DEBUG_MESSENGER=true` (브라우저) · `DEBUG_MESSENGER=true` (서버) |
 * | localStorage | `localStorage.setItem("samarket:debug:messenger","1")` 후 새로고침 |
 *
 * 운영·일반 개발(`/stores/*` 등)에서는 콘솔·진단 루프가 실행되지 않는다.
 */

function isTruthyEnv(value: string | undefined): boolean {
  if (value == null || value === "") return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true";
}

function readLocalStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** CM Realtime·통화·홈 진단 — `console.*` 및 진단 전용 `setInterval` 게이트 */
export function isDebugMessengerEnabled(): boolean {
  if (typeof process !== "undefined") {
    const env = process.env;
    if (isTruthyEnv(env.NEXT_PUBLIC_DEBUG_MESSENGER)) return true;
    if (isTruthyEnv(env.DEBUG_MESSENGER)) return true;
  }
  return readLocalStorageFlag("samarket:debug:messenger");
}
