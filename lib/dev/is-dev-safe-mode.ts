/**
 * Dev Stability Pack — `DEV_SAFE_MODE=1` 또는 `NEXT_PUBLIC_DEV_SAFE_MODE=1` (개발 전용).
 * - **브라우저**: `DEV_SAFE_MODE` 는 번들에 없을 수 있으므로 `NEXT_PUBLIC_DEV_SAFE_MODE` 만 신뢰한다.
 * - **서버/SSR**: `next.config.js` env + 런타임 `DEV_SAFE_MODE` 둘 다 허용.
 * Production 은 `NODE_ENV === "production"` 이므로 항상 false.
 */
export function isDevSafeMode(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const pub = process.env.NEXT_PUBLIC_DEV_SAFE_MODE === "1";
  if (typeof window === "undefined") {
    return pub || process.env.DEV_SAFE_MODE === "1";
  }
  return pub;
}

let devSafeProbeServerLogged = false;
let devSafeProbeClientLogged = false;

/** 서버·클라 각 1회 — `isDevSafeMode()` 및 관련 env 노출 여부 확인용 */
export function logDevSafeModeProbeOnce(where: "server" | "client"): void {
  if (process.env.NODE_ENV !== "development") return;
  if (where === "server") {
    if (devSafeProbeServerLogged) return;
    devSafeProbeServerLogged = true;
    // eslint-disable-next-line no-console -- dev-only one-shot probe
    console.info("[DEV_SAFE_MODE_PROBE]", "server", {
      isDevSafeMode: isDevSafeMode(),
      DEV_SAFE_MODE: process.env.DEV_SAFE_MODE ?? null,
      NEXT_PUBLIC_DEV_SAFE_MODE: process.env.NEXT_PUBLIC_DEV_SAFE_MODE ?? null,
    });
    return;
  }
  if (typeof window === "undefined") return;
  if (devSafeProbeClientLogged) return;
  devSafeProbeClientLogged = true;
  // eslint-disable-next-line no-console -- dev-only one-shot probe
  console.info("[DEV_SAFE_MODE_PROBE]", "client", {
    isDevSafeMode: isDevSafeMode(),
    NEXT_PUBLIC_DEV_SAFE_MODE: process.env.NEXT_PUBLIC_DEV_SAFE_MODE ?? null,
  });
}
