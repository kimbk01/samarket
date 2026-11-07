/**
 * DIBAY Windows 데스크톱 셸(WebView2 + MSIX) 판정·브리지 — 설계 W0 (`docs/audit/windows-desktop-shell-design-2026-11-07.md`).
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

export const DIBAY_WINDOWS_SHELL_BRIDGE_VERSION = 1;

/** 웹 → 셸 메시지 (W0: app.info 만. auth.open = W2, push.register = W3) */
export type DibayWindowsShellRequest = { type: "app.info"; bridgeVersion: number };

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
