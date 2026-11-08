// @vitest-environment jsdom
/**
 * C8 진입 계측 송신 — 관측 전용(동작 불변)·송신 상한·청크 새로고침 회복 기록·예외 삼킴.
 * docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C8
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_NO_RELEASE_OBSERVE_MS,
  ENTRY_RESUME_MIN_HIDDEN_MS,
  noteEntryFailure,
  noteEntryReleased,
  resetEntryTelemetryForTests,
  startEntryTelemetry,
} from "@/lib/telemetry/entry-telemetry.client";
import { ENTRY_TELEMETRY_ENDPOINT, ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN } from "@/lib/telemetry/entry-telemetry-contract";

type Sent = { url: string; body: Record<string, unknown> };

let sent: Sent[] = [];
const RealBlob = globalThis.Blob;

/** Blob 본문을 동기로 꺼내기 위해 생성 인자를 기억하는 Blob. */
class CapturingBlob extends RealBlob {
  readonly raw: string;
  constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
    super(parts, opts);
    this.raw = parts.map((p) => String(p)).join("");
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }
}

function installBeacon(): void {
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (url: string, data: CapturingBlob) => {
      sent.push({ url, body: JSON.parse(data.raw) });
      return true;
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.Blob = CapturingBlob as unknown as typeof Blob;
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  sent = [];
  sessionStorage.clear();
  resetEntryTelemetryForTests();
  installBeacon();
  delete (window as unknown as Record<string, unknown>).Capacitor;
  delete (window as unknown as Record<string, unknown>).__dibayBootMetrics;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.Blob = RealBlob;
  vi.useRealTimers();
});

describe("entry telemetry client", () => {
  it("해제 시 1건 — 사유·단계 시각·플랫폼, 개인정보 없음", async () => {
    (window as unknown as { __dibayBootMetrics: Record<string, number> }).__dibayBootMetrics = {
      firstHtml: 300,
      reactMounted: 800,
    };
    startEntryTelemetry();
    noteEntryReleased("initialDestinationVisualReady");
    noteEntryReleased("initialDestinationVisualReady");
    await flush();
    await Promise.resolve();
    const released = sent.filter((s) => s.body.ev === "released");
    expect(released).toHaveLength(1);
    expect(released[0].url).toBe(ENTRY_TELEMETRY_ENDPOINT);
    expect(released[0].body).toMatchObject({
      kind: "cold",
      platform: "web",
      releaseReason: "initialDestinationVisualReady",
      recovery: "none",
    });
    expect((released[0].body.t as Record<string, number>).firstHtml).toBe(300);
    expect(JSON.stringify(released[0].body)).not.toMatch(/token|email|userId|cookie/i);
  });

  it("해제 신호가 관측 한도 안에 없으면 no_release 1건 (해제는 하지 않음)", async () => {
    startEntryTelemetry();
    await vi.advanceTimersByTimeAsync(ENTRY_NO_RELEASE_OBSERVE_MS + 10);
    await flush();
    await Promise.resolve();
    expect(sent.filter((s) => s.body.ev === "no_release")).toHaveLength(1);
  });

  it("관측 한도 전에 해제되면 no_release 없음", async () => {
    startEntryTelemetry();
    noteEntryReleased("auth_shell_fallback");
    await vi.advanceTimersByTimeAsync(ENTRY_NO_RELEASE_OBSERVE_MS + 10);
    await flush();
    await Promise.resolve();
    expect(sent.some((s) => s.body.ev === "no_release")).toBe(false);
  });

  it("청크 새로고침 실패는 즉시 송신하고, 다음 문서 해제가 after_reload 로 회복을 남긴다", async () => {
    startEntryTelemetry();
    noteEntryFailure("chunk_reload");
    expect(sent.filter((s) => s.body.failure === "chunk_reload")).toHaveLength(1);
    expect(sent[0].body.reloads).toBe(1);

    // 새 문서 (새로고침 후)
    resetEntryTelemetryForTests();
    sent = [];
    startEntryTelemetry();
    noteEntryReleased("initialDestinationVisualReady");
    await flush();
    await Promise.resolve();
    const released = sent.find((s) => s.body.ev === "released");
    expect(released?.body).toMatchObject({ recovery: "after_reload", prevFailure: "chunk_reload", reloads: 1 });
  });

  it("문서당 송신 상한을 지킨다", async () => {
    startEntryTelemetry();
    for (let i = 0; i < ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN + 5; i += 1) noteEntryFailure("error_boundary");
    await flush();
    await Promise.resolve();
    expect(sent.length).toBeLessThanOrEqual(ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN);
  });

  it("짧은 백그라운드는 복귀로 기록하지 않고, 긴 백그라운드는 1건", async () => {
    let state: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    startEntryTelemetry();
    noteEntryReleased("initialDestinationVisualReady");

    state = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10_000);
    state = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    await Promise.resolve();
    expect(sent.some((s) => s.body.ev === "resume")).toBe(false);

    state = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(ENTRY_RESUME_MIN_HIDDEN_MS + 1000);
    state = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    await Promise.resolve();
    const resumes = sent.filter((s) => s.body.ev === "resume");
    expect(resumes).toHaveLength(1);
    expect(resumes[0].body.kind).toBe("resume");
    expect(Number(resumes[0].body.hiddenMs)).toBeGreaterThanOrEqual(ENTRY_RESUME_MIN_HIDDEN_MS);
  });

  it("송신 수단이 없거나 throw 해도 예외가 밖으로 나가지 않는다", async () => {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => {
        throw new Error("boom");
      },
    });
    const g = globalThis as { fetch?: unknown };
    const prevFetch = g.fetch;
    g.fetch = undefined;
    expect(() => {
      startEntryTelemetry();
      noteEntryReleased("x");
      noteEntryFailure("chunk_reload");
    }).not.toThrow();
    await flush();
    g.fetch = prevFetch;
  });

  it("네이티브 앱 정보는 window.Capacitor 전역에서만 읽는다 (동적 import 없음)", async () => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      getPlatform: () => "android",
      Plugins: { App: { getInfo: () => Promise.resolve({ version: "1.2.5", build: "37" }) } },
    };
    startEntryTelemetry();
    noteEntryReleased("initialDestinationVisualReady");
    await flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.find((s) => s.body.ev === "released")?.body).toMatchObject({
      platform: "android",
      appVersion: "1.2.5",
      appBuild: "37",
    });
    const src = readFileSync("lib/telemetry/entry-telemetry.client.ts", "utf8");
    expect(src).not.toMatch(/await import\(|import\("@/);
  });

  it("AppEntryKind 캐시 키가 lifecycle 모듈과 같다 (판정을 새로 일으키지 않음)", () => {
    const lifecycle = readFileSync("lib/lifecycle/app-entry-kind.ts", "utf8");
    const client = readFileSync("lib/telemetry/entry-telemetry.client.ts", "utf8");
    expect(lifecycle).toContain('const DECISION_KEY = "__dibayAppEntryDecision";');
    expect(client).toContain('const APP_ENTRY_DECISION_KEY = "__dibayAppEntryDecision";');
    expect(client).not.toContain("getAppEntryDecision(");
  });
});

describe("연결 지점 (동작 불변)", () => {
  it("해제 함수는 기존 순서대로 해제하고 계측만 추가한다 — 타이머 없음 유지", () => {
    const src = readFileSync("lib/startup/startup-metrics.ts", "utf8");
    const start = src.indexOf("export function tryDismissNativeSplash");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).toContain("noteEntryReleased(reason);");
    expect(body).not.toContain("setTimeout");
  });
  it("청크 새로고침·오류 화면·부팅에 계측이 연결돼 있다", () => {
    expect(readFileSync("lib/next/import-with-chunk-retry.ts", "utf8")).toContain('noteEntryFailure("chunk_reload");');
    expect(readFileSync("app/error.tsx", "utf8")).toContain('noteEntryFailure("error_boundary");');
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain('noteEntryFailure("global_error");');
    expect(readFileSync("components/app/AppBootProvider.tsx", "utf8")).toContain("startEntryTelemetry();");
  });
});
