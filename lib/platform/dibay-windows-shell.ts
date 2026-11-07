/**
 * DIBAY Windows 데스크톱 셸(WebView2 + MSIX) 판정·브리지 — 설계 W0 (`docs/audit/windows-desktop-shell-design-2026-11-07.md`).
 *
 * W2 (2026-11-08): 기본 브라우저 로그인 — `auth.open`(웹 → 셸) · `auth.return`(셸 → 웹, dibay://auth/callback).
 *
 * W0 계약 — 동작 변화 0:
 * - 기존 Android·iOS 판정(`resolveCapacitorShellPlatform`, `DibayAppPlatform = android | ios`)은 **건드리지 않는다**.
 *   거기에 `windows` 를 넣으면 「셸이면(=non-null) 네이티브 경로」로 가는 호출처(로그인·푸시·통화·권한)가 바뀐다.
 * - Windows 셸은 이 파일의 별도 함수로만 알아본다. W0 에서 쓰는 곳은 화면 속성(`data-dibay-host-shell`) 하나뿐이다.
 *   그 밖의 분기(로그인 W2·알림 W3·업데이트 W5)는 각 단계 승인 때 연결한다.
 *
 * 판정 근거: WebView2 는 호스트 페이지에 `window.chrome.webview`(postMessage·addEventListener)를 노출한다.
 * Edge·Chrome 브라우저에는 이 객체가 없다. 셸은 첫 메시지 `app.info` 로 버전을 알려 준다.
 */

/**
 * 브리지 버전 — 셸(`windows/DibayDesktop/AppConfig.cs` BridgeVersion)과 같아야 한다.
 * v1 = W0 (app.info) · v2 = W2 (auth.open · auth.return — 기본 브라우저 로그인)
 */
export const DIBAY_WINDOWS_SHELL_BRIDGE_VERSION = 2;

/** 기본 브라우저 로그인(W2)을 지원하는 최소 셸 브리지 버전 — 이보다 낮은 셸(W0 빌드)은 앱 창 안 로그인 유지. */
export const DIBAY_WINDOWS_SHELL_BROWSER_LOGIN_MIN_BRIDGE = 2;

/** 웹 → 셸 메시지 (app.info = W0 · auth.open = W2 · push.register = W3 예정) */
export type DibayWindowsShellRequest =
  | { type: "app.info"; bridgeVersion: number }
  | { type: "auth.open"; bridgeVersion: number; url: string }
  /** 앱이 dibay:// 로 새로 켜진 경우(콜드 스타트) — 웹이 준비된 뒤 셸이 보관한 복귀 주소를 달라고 요청 */
  | { type: "auth.return.request"; bridgeVersion: number };

/** 셸 → 웹 메시지 */
export type DibayWindowsShellAppInfo = {
  type: "app.info";
  shell: "windows";
  bridgeVersion: number;
  appVersion: string;
};

type WebView2Bridge = {
  postMessage: (message: unknown) => void;
  addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
  removeEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
};

function readWebView2Bridge(): WebView2Bridge | null {
  if (typeof window === "undefined") return null;
  const chromeObj = (window as Window & { chrome?: { webview?: Partial<WebView2Bridge> } }).chrome;
  const webview = chromeObj?.webview;
  if (
    webview &&
    typeof webview.postMessage === "function" &&
    typeof webview.addEventListener === "function" &&
    typeof webview.removeEventListener === "function"
  ) {
    return webview as WebView2Bridge;
  }
  return null;
}

/** WebView2 셸 안에서 열렸는가. 브라우저·Android·iOS 는 false. */
export function isDibayWindowsShell(): boolean {
  return readWebView2Bridge() !== null;
}

/** 화면 속성용 값 — Windows 셸이면 "windows", 아니면 "" (서버 렌더도 ""). */
export function readDibayHostShellAttr(): "windows" | "" {
  return isDibayWindowsShell() ? "windows" : "";
}

export function parseDibayWindowsShellAppInfo(data: unknown): DibayWindowsShellAppInfo | null {
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.type !== "app.info" || o.shell !== "windows") return null;
  const bridgeVersion = Number(o.bridgeVersion);
  const appVersion = typeof o.appVersion === "string" ? o.appVersion.trim() : "";
  if (!Number.isInteger(bridgeVersion) || bridgeVersion < 1 || !appVersion) return null;
  return { type: "app.info", shell: "windows", bridgeVersion, appVersion };
}

/**
 * 셸 버전 묻기 — 셸이 아니거나 시간 안에 답이 없으면 null.
 * 모르는(더 높은) bridgeVersion 이어도 값은 돌려준다. 호출처가 W0 동작(웹과 같음)으로 내려가는 것은 호출처 책임.
 */
export function requestDibayWindowsShellAppInfo(timeoutMs = 1_500): Promise<DibayWindowsShellAppInfo | null> {
  const bridge = readWebView2Bridge();
  if (!bridge) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: DibayWindowsShellAppInfo | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      bridge.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event: { data: unknown }) => {
      const info = parseDibayWindowsShellAppInfo(event.data);
      if (info) finish(info);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    bridge.addEventListener("message", onMessage);
    const request: DibayWindowsShellRequest = { type: "app.info", bridgeVersion: DIBAY_WINDOWS_SHELL_BRIDGE_VERSION };
    try {
      bridge.postMessage(request);
    } catch {
      finish(null);
    }
  });
}

/**
 * 셸이 기본 브라우저 로그인(W2)을 지원하는가 — 셸 버전을 한 번 묻고 기억한다.
 * Windows 셸이 아니거나, 답이 없거나, v1(W0 빌드)이면 false → 호출처는 기존 경로(앱 창 안 로그인).
 */
let browserLoginSupportPromise: Promise<boolean> | null = null;

export function supportsDibayWindowsShellBrowserLogin(): Promise<boolean> {
  if (!isDibayWindowsShell()) return Promise.resolve(false);
  if (!browserLoginSupportPromise) {
    browserLoginSupportPromise = requestDibayWindowsShellAppInfo().then(
      (info) => info != null && info.bridgeVersion >= DIBAY_WINDOWS_SHELL_BROWSER_LOGIN_MIN_BRIDGE,
    );
  }
  return browserLoginSupportPromise;
}

/** 테스트 전용 — 기억한 셸 버전 판정 초기화. */
export function resetDibayWindowsShellBrowserLoginSupportForTests(): void {
  browserLoginSupportPromise = null;
}

/**
 * 로그인 인가 주소를 셸에 넘겨 **기본 브라우저**로 연다 (W2).
 * 셸은 https + Supabase 호스트만 연다 — 그 밖의 주소는 셸이 무시한다.
 * @returns 메시지를 보냈으면 true (브라우저가 실제로 열렸는지는 셸만 안다)
 */
export function openDibayWindowsShellSystemBrowser(url: string): boolean {
  const bridge = readWebView2Bridge();
  if (!bridge) return false;
  const request: DibayWindowsShellRequest = {
    type: "auth.open",
    bridgeVersion: DIBAY_WINDOWS_SHELL_BRIDGE_VERSION,
    url,
  };
  try {
    bridge.postMessage(request);
    return true;
  } catch {
    return false;
  }
}

/** 셸 → 웹 `auth.return.available` — 복귀 주소를 보관했으니 요청하라는 알림. */
export function isDibayWindowsShellAuthReturnAvailable(data: unknown): boolean {
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).type === "auth.return.available");
}

/** 셸 → 웹 `auth.return` — `dibay://auth/callback…` 주소만 꺼낸다. */
export function parseDibayWindowsShellAuthReturn(data: unknown): string | null {
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.type !== "auth.return" || typeof o.url !== "string") return null;
  const url = o.url.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "dibay:" || parsed.host !== "auth" || !parsed.pathname.startsWith("/callback")) {
      return null;
    }
  } catch {
    return null;
  }
  return url;
}

/**
 * 셸이 보내는 로그인 복귀(`auth.return`) 구독 — Windows 셸이 아니면 아무것도 하지 않는다.
 * @returns 구독 해제 함수
 */
export function subscribeDibayWindowsShellAuthReturn(onReturn: (nativeUrl: string) => void): () => void {
  const bridge = readWebView2Bridge();
  if (!bridge) return () => {};
  const listener = (event: { data: unknown }) => {
    if (isDibayWindowsShellAuthReturnAvailable(event.data)) {
      // 셸이 복귀 주소를 보관했다는 알림 → 받아 간다 (셸은 한 번 보낸 뒤 지운다 — 같은 코드 재사용 방지)
      requestDibayWindowsShellPendingAuthReturn();
      return;
    }
    const url = parseDibayWindowsShellAuthReturn(event.data);
    if (url) onReturn(url);
  };
  bridge.addEventListener("message", listener);
  return () => bridge.removeEventListener("message", listener);
}

/**
 * 콜드 스타트 복귀 — 앱이 꺼진 상태에서 `dibay://` 로 켜지면, 셸이 주소를 보관했다가 이 요청에 `auth.return` 으로 답한다.
 * 이미 켜진 앱에서의 복귀는 셸이 바로 `auth.return` 을 보낸다(구독으로 받음).
 */
export function requestDibayWindowsShellPendingAuthReturn(): void {
  const bridge = readWebView2Bridge();
  if (!bridge) return;
  const request: DibayWindowsShellRequest = {
    type: "auth.return.request",
    bridgeVersion: DIBAY_WINDOWS_SHELL_BRIDGE_VERSION,
  };
  try {
    bridge.postMessage(request);
  } catch {
    /* 셸이 닫히는 중 — 무시 */
  }
}
