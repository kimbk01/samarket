// @vitest-environment jsdom
/**
 * R2-b — 비통화 경로 청크 새로고침은 빌드당 1회 (무한 새로고침 방지). 통화 경계는 기존 함수 그대로.
 * docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §1 R2-b
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/entry-telemetry.client", () => ({ noteEntryFailure: vi.fn() }));

import {
  clearChunkReloadSessionFlag,
  SAMARKET_CHUNK_RELOAD_BUILD_KEY,
  scheduleChunkReloadOncePerBuild,
} from "@/lib/next/import-with-chunk-retry";

let reload: ReturnType<typeof vi.fn>;
const realLocation = window.location;

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, reload } });
  vi.stubEnv("NEXT_PUBLIC_WEB_DEPLOY_SHA", "abc1234");
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  vi.unstubAllEnvs();
});

describe("scheduleChunkReloadOncePerBuild", () => {
  it("같은 빌드에서 첫 실패만 새로고침", () => {
    expect(scheduleChunkReloadOncePerBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SAMARKET_CHUNK_RELOAD_BUILD_KEY)).toBe("abc1234");
  });

  it("새로고침 뒤 마운트가 기존 1회 표시를 지워도 같은 빌드로는 다시 새로고침하지 않는다 (무한 반복 차단)", () => {
    scheduleChunkReloadOncePerBuild();
    clearChunkReloadSessionFlag(); // AppBootProvider 마운트 동작
    expect(scheduleChunkReloadOncePerBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("새 배포(빌드 변경)면 1회 다시 허용", () => {
    scheduleChunkReloadOncePerBuild();
    vi.stubEnv("NEXT_PUBLIC_WEB_DEPLOY_SHA", "def5678");
    expect(scheduleChunkReloadOncePerBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("저장소를 못 쓰면 새로고침하지 않는다", () => {
    const desc = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      expect(scheduleChunkReloadOncePerBuild()).toBe(false);
    } finally {
      if (desc) Object.defineProperty(window, "sessionStorage", desc);
    }
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("호출처 계약", () => {
  it("비통화 경로 3곳은 빌드당 1회 함수를 쓴다", () => {
    expect(readFileSync("app/error.tsx", "utf8")).toContain("scheduleChunkReloadOncePerBuild()");
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain("scheduleChunkReloadOncePerBuild()");
    expect(readFileSync("components/app/AppBootProvider.tsx", "utf8")).toContain("scheduleChunkReloadOncePerBuild()");
  });
  it("통화 경계는 기존 함수 그대로 (통화 규정 — 이번 변경 범위 밖)", () => {
    expect(readFileSync("components/layout/providers/IncomingCallOverlayChunkBoundary.tsx", "utf8")).toContain(
      "scheduleChunkReloadOnce();"
    );
    const lib = readFileSync("lib/next/import-with-chunk-retry.ts", "utf8");
    const fn = lib.slice(lib.indexOf("export function importWithChunkRetry"));
    expect(fn).toContain("scheduleChunkReloadOnce();");
  });
});
