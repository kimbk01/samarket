import {
  AUTH_FAILURE_TELEMETRY_ENDPOINT,
  AUTH_FAILURE_TELEMETRY_SCHEMA_VERSION,
  type AuthFailureResult,
  type AuthFailureTelemetryEvent,
} from "@/lib/telemetry/auth-failure-telemetry-contract";
import { setAuthLifecycleCompletionSink } from "@/lib/auth/oauth/auth-lifecycle-trace";

/**
 * 로그인 실패·취소 1회 → 서버 기록 (sendBeacon, 없으면 fetch keepalive).
 * 관측 경로 전용: 어떤 실패도 로그인 동작을 막지 않는다. 같은 authFlowId 는 한 번만 보낸다.
 */

type AppInfo = { version: string | null; build: string | null };
type CapWindow = Window & {
  Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ version?: string; build?: string }> } } };
};

const sentFlowIds = new Set<string>();
let appInfo: AppInfo | null = null;
let appInfoPromise: Promise<AppInfo> | null = null;

function loadAppInfo(): Promise<AppInfo> {
  if (appInfo) return Promise.resolve(appInfo);
  if (appInfoPromise) return appInfoPromise;
  const w = (typeof window !== "undefined" ? window : undefined) as CapWindow | undefined;
  const app = w?.Capacitor?.Plugins?.App;
  if (!app || typeof app.getInfo !== "function") {
    appInfo = { version: null, build: null };
    return Promise.resolve(appInfo);
  }
  appInfoPromise = new Promise<AppInfo>((resolve) => {
    let done = false;
    const finish = (info: { version?: string; build?: string } | null) => {
      if (done) return;
      done = true;
      appInfo = {
        version: typeof info?.version === "string" ? info.version : null,
        build: typeof info?.build === "string" ? info.build : null,
      };
      resolve(appInfo);
    };
    try {
      app.getInfo!.call(app).then((info) => finish(info ?? null)).catch(() => finish(null));
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
  return appInfoPromise;
}

function transmit(event: AuthFailureTelemetryEvent): void {
  try {
    const body = JSON.stringify(event);
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && typeof nav.sendBeacon === "function") {
      if (nav.sendBeacon(AUTH_FAILURE_TELEMETRY_ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    }
    if (typeof fetch === "function") {
      void fetch(AUTH_FAILURE_TELEMETRY_ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        credentials: "omit",
        headers: { "content-type": "text/plain" },
      }).catch(() => undefined);
    }
  } catch {
    /* 관측 실패는 무시 */
  }
}

export type AuthLoginFailureReport = {
  authFlowId: string;
  result: AuthFailureResult;
  provider: string;
  platform: string;
  flowKind: string | null;
  errorCode: string | null;
  reason: string | null;
  lastStage: string | null;
  elapsedMs: number;
  nativeErrorCode: number | null;
};

export function reportAuthLoginFailure(report: AuthLoginFailureReport): void {
  try {
    if (typeof window === "undefined") return;
    if (!report.authFlowId || sentFlowIds.has(report.authFlowId)) return;
    sentFlowIds.add(report.authFlowId);
    void loadAppInfo()
      .then((info) => {
        transmit({
          v: AUTH_FAILURE_TELEMETRY_SCHEMA_VERSION,
          ...report,
          appVersion: info.version,
          appBuild: info.build,
          webSha: (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim() || null,
        });
      })
      .catch(() => undefined);
  } catch {
    /* 관측 실패는 무시 */
  }
}

/** 로그인 흐름 종료 중 fail·cancel 만 서버로 (ok 는 교환 API 가 이미 기록). 여러 번 불러도 같다. */
export function installAuthLoginFailureTelemetry(): void {
  setAuthLifecycleCompletionSink((summary) => {
    if (summary.result !== "fail" && summary.result !== "cancel") return;
    reportAuthLoginFailure({ ...summary, result: summary.result });
  });
}

export function resetAuthFailureTelemetryForTests(): void {
  sentFlowIds.clear();
  appInfo = null;
  appInfoPromise = null;
}
