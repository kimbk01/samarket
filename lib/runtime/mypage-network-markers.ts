/**
 * Temporary mypage cold-path network markers (address-defaults / owner-lite stores).
 * Ring buffer on `window.__SAMARKET_MYPAGE_NET_MARKERS__` + console `[mypage-net-marker]`.
 * DO NOT log PII (address lines, phone, etc.).
 */
export type MypageNetMarkerEvent =
  | "address_defaults_network_start"
  | "address_defaults_deduped"
  | "address_defaults_cache_hit"
  | "address_defaults_network_success"
  | "address_defaults_network_abort"
  | "address_defaults_network_error"
  | "address_defaults_result_dropped"
  | "owner_lite_store_subscribe"
  | "owner_lite_store_unsubscribe"
  | "owner_lite_store_auto_hydrate_skipped"
  | "owner_lite_store_network_deduped"
  | "owner_lite_store_network_start"
  | "owner_lite_store_network_success";

export type MypageNetMarker = {
  event: MypageNetMarkerEvent;
  requestId?: string;
  timestamp: number;
  viewerId?: string | null;
  pathname?: string;
  documentUrl?: string;
  routeGeneration?: number;
  appBootGeneration?: number;
  mypageMountGeneration?: number;
  force?: boolean;
  hasInflight?: boolean;
  inflightKey?: string;
  hasFreshMemorySnapshot?: boolean;
  hasFreshSessionSnapshot?: boolean;
  cacheAgeMs?: number | null;
  visibilityState?: string;
  isColdBoot?: boolean;
  caller?: string;
  reason?: string;
  subscriber?: string;
  subscribeReason?: string;
  autoHydrate?: boolean;
  activeSubscriberCount?: number;
  hasSnapshot?: boolean;
  snapshotAgeMs?: number | null;
  schedulePathname?: string;
  executionPathname?: string;
  stack?: string;
  detail?: string;
};

const MAX = 80;
const MARKER_KEY = "__SAMARKET_MYPAGE_NET_MARKERS__";
const BOOT_TS_KEY = "__SAMARKET_MYPAGE_NET_BOOT_TS__";
const ROUTE_GEN_KEY = "__SAMARKET_MYPAGE_NET_ROUTE_GEN__";
const MYPAGE_MOUNT_GEN_KEY = "__SAMARKET_MYPAGE_NET_MYPAGE_MOUNT_GEN__";
const COLD_FLAG_KEY = "samarket:mypage-net:cold-boot:v1";
const OWNER_LITE_SESSION_KEY = "samarket:stores:owner-lite:snapshot:v1";
const MYPAGE_HOME_SESSION_KEY = "samarket:mypage-home:v1";

type MarkerHost = Window & {
  [MARKER_KEY]?: MypageNetMarker[];
  [BOOT_TS_KEY]?: number;
  [ROUTE_GEN_KEY]?: number;
  [MYPAGE_MOUNT_GEN_KEY]?: number;
};

function host(): MarkerHost | null {
  if (typeof window === "undefined") return null;
  return window as MarkerHost;
}

function ensureRouteGenerationHook(w: MarkerHost): void {
  if (typeof w[ROUTE_GEN_KEY] === "number") return;
  w[ROUTE_GEN_KEY] = 0;
  w[BOOT_TS_KEY] = Date.now();
  try {
    if (!sessionStorage.getItem(COLD_FLAG_KEY)) {
      sessionStorage.setItem(COLD_FLAG_KEY, String(w[BOOT_TS_KEY]));
    }
  } catch {
    /* ignore */
  }
  const bump = () => {
    w[ROUTE_GEN_KEY] = (w[ROUTE_GEN_KEY] ?? 0) + 1;
  };
  w.addEventListener("popstate", bump);
  try {
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      bump();
      return origPush(...args);
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      bump();
      return origReplace(...args);
    };
  } catch {
    /* ignore */
  }
}

export function bumpMypageMountGeneration(): number {
  const w = host();
  if (!w) return 0;
  ensureRouteGenerationHook(w);
  w[MYPAGE_MOUNT_GEN_KEY] = (w[MYPAGE_MOUNT_GEN_KEY] ?? 0) + 1;
  return w[MYPAGE_MOUNT_GEN_KEY]!;
}

export function peekMypageNetMarkers(): MypageNetMarker[] {
  const w = host();
  return w?.[MARKER_KEY] ? [...w[MARKER_KEY]!] : [];
}

export function clearMypageNetMarkers(): void {
  const w = host();
  if (w) w[MARKER_KEY] = [];
}

function hasSessionKey(key: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(key));
  } catch {
    return false;
  }
}

export function pushMypageNetMarker(partial: Omit<MypageNetMarker, "timestamp"> & { timestamp?: number }): void {
  const w = host();
  if (!w) return;
  ensureRouteGenerationHook(w);
  let isColdBoot = false;
  try {
    const bootFlag = sessionStorage.getItem(COLD_FLAG_KEY);
    isColdBoot = bootFlag != null && Number(bootFlag) === w[BOOT_TS_KEY];
  } catch {
    isColdBoot = false;
  }
  const entry: MypageNetMarker = {
    ...partial,
    timestamp: partial.timestamp ?? Date.now(),
    pathname: partial.pathname ?? w.location?.pathname,
    documentUrl: partial.documentUrl ?? w.location?.href?.split("?")[0],
    visibilityState: partial.visibilityState ?? w.document?.visibilityState,
    routeGeneration: partial.routeGeneration ?? w[ROUTE_GEN_KEY] ?? 0,
    appBootGeneration: partial.appBootGeneration ?? w[BOOT_TS_KEY] ?? 0,
    mypageMountGeneration: partial.mypageMountGeneration ?? w[MYPAGE_MOUNT_GEN_KEY] ?? 0,
    isColdBoot: partial.isColdBoot ?? isColdBoot,
    hasFreshSessionSnapshot:
      partial.hasFreshSessionSnapshot ??
      (hasSessionKey(OWNER_LITE_SESSION_KEY) || hasSessionKey(MYPAGE_HOME_SESSION_KEY)),
  };
  const buf = w[MARKER_KEY] ?? (w[MARKER_KEY] = []);
  buf.push(entry);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  try {
    console.info("[mypage-net-marker]", JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

export function captureCallerStack(maxFrames = 8): string {
  try {
    const err = new Error("mypage-net-marker");
    const lines = String(err.stack || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(2, 2 + maxFrames);
    return lines.join(" | ").slice(0, 800);
  } catch {
    return "";
  }
}

let requestSeq = 0;
export function nextMypageNetRequestId(prefix: string): string {
  requestSeq += 1;
  return `${prefix}-${Date.now()}-${requestSeq}`;
}
