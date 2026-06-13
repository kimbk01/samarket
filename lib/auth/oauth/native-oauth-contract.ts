import {
  NATIVE_OAUTH_CAPACITOR_RETURN_PATH,
  NATIVE_OAUTH_CALLBACK_URL,
} from "@/lib/auth/oauth/native-oauth-redirect";

/** Capacitor bridge ready — launch / open / fetch 공통 */
export const NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS = 5_000;

/** OAuthReturnListener attach 전 bridge 대기 */
export const NATIVE_OAUTH_RETURN_LISTENER_BRIDGE_MS = NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS;

/** Custom Tab open 후 background 감지 (실패해도 open 자체는 성공) */
export const NATIVE_OAUTH_BACKGROUND_DETECT_MS = 5_000;

export const NATIVE_OAUTH_START_FETCH_TIMEOUT_MS = 10_000;
export const NATIVE_OAUTH_LAUNCH_PATH = "/auth/oauth/launch";

/**
 * Native OAuth A-plan PASS (device QA):
 * 1. native_start_ok + redirectTo=https://.../auth/oauth/capacitor-return
 * 2. custom_tabs_success (Android Logcat)
 * 3. capacitor_return_bridge (Custom Tab https → dibay://)
 * 4. callback_app_url_open 또는 DIBAY_OAuth intent_received
 * 5. callback_navigate → exchange_success → logged-in UI
 */
export const NATIVE_OAUTH_PASS_LOG_EVENTS = [
  "native_start_ok",
  "capacitor_return_bridge",
  "callback_app_url_open",
  "callback_navigate",
  "exchange_success",
] as const;

export function isOAuthLaunchPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "";
  return path === NATIVE_OAUTH_LAUNCH_PATH || path.startsWith(`${NATIVE_OAUTH_LAUNCH_PATH}/`);
}

/** OAuth 진행 중 foreground 복귀 — pending UI를 조기 해제하지 않음 */
export function isOAuthInFlightPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "";
  return (
    isOAuthLaunchPath(path)
    || path === "/auth/callback"
    || path === NATIVE_OAUTH_CAPACITOR_RETURN_PATH
  );
}

export function normalizeOAuthQuery(search: string): URLSearchParams {
  const trimmed = search.trim();
  if (!trimmed) return new URLSearchParams();
  return new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
}

/** capacitor-return → dibay:// 핸드오프 — code/error 없으면 브릿지하지 않음 */
export function shouldBridgeCapacitorReturnToApp(search: string, hash: string): boolean {
  const params = normalizeOAuthQuery(search);
  if (params.has("code") || params.has("error") || params.has("error_description")) {
    return true;
  }
  const h = hash.trim();
  if (!h) return false;
  const normalized = h.startsWith("#") ? h.slice(1) : h;
  return normalized.includes("code=") || normalized.includes("access_token=");
}

export function buildValidatedNativeAppCallbackUrl(search: string, hash: string): string | null {
  if (!shouldBridgeCapacitorReturnToApp(search, hash)) return null;
  const q = search.trim();
  const h = hash.trim();
  return `${NATIVE_OAUTH_CALLBACK_URL}${q.startsWith("?") || !q ? q : `?${q}`}${h}`;
}

/** Web OAuth / Native launch 동시 start 방지 — 단일 in-flight flow */
export const OAUTH_FLOW_IN_FLIGHT_TTL_MS = 45_000;

type OAuthFlowLock = {
  provider: string;
  token: number;
  expiresAt: number;
};

let oauthFlowLock: OAuthFlowLock | null = null;
let oauthFlowTokenSeq = 0;

function dropExpiredOAuthFlow(now = Date.now()): void {
  if (oauthFlowLock && oauthFlowLock.expiresAt <= now) {
    oauthFlowLock = null;
  }
}

export function isOAuthFlowInFlight(): boolean {
  dropExpiredOAuthFlow();
  return oauthFlowLock !== null;
}

export type OAuthFlowBeginResult =
  | {
      ok: true;
      provider: string;
      release: () => void;
    }
  | {
      ok: false;
      provider: string;
      inFlightProvider: string;
    };

export function tryBeginOAuthFlow(provider = "unknown"): OAuthFlowBeginResult {
  const p = provider.trim() || "unknown";
  dropExpiredOAuthFlow();
  if (oauthFlowLock) {
    return { ok: false, provider: p, inFlightProvider: oauthFlowLock.provider };
  }

  const token = ++oauthFlowTokenSeq;
  oauthFlowLock = {
    provider: p,
    token,
    expiresAt: Date.now() + OAUTH_FLOW_IN_FLIGHT_TTL_MS,
  };
  return {
    ok: true,
    provider: p,
    release: () => {
      if (oauthFlowLock?.token === token) {
        oauthFlowLock = null;
      }
    },
  };
}

export function endOAuthFlow(provider?: string): void {
  if (!provider?.trim() || oauthFlowLock?.provider === provider.trim()) {
    oauthFlowLock = null;
  }
}

/** OAuth 취소·뒤로가기 후 login 복귀 — lock 즉시 해제 (성공 navigation TTL 유지) */
export function releaseOAuthFlowOnUserCancel(): void {
  oauthFlowLock = null;
}

export function resetOAuthFlowForTests(): void {
  oauthFlowLock = null;
  oauthFlowTokenSeq = 0;
}
