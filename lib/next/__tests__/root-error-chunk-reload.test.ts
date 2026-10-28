/**
 * 2026-10-28 실기: 배포 전환 직후 ChunkLoadError → app/error.tsx 「다시 시도」가 reset 만 해 무한 실패.
 * 최상위 오류 화면과 같이 코드 조각 오류는 한 번 자동 새로고침, 「다시 시도」도 새로고침.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isWebpackChunkLoadError } from "@/lib/next/import-with-chunk-retry";

describe("RootError ChunkLoadError", () => {
  it("판정", () => {
    const e = new Error("Failed to load chunk /_next/static/chunks/x.js from module 1");
    e.name = "ChunkLoadError";
    expect(isWebpackChunkLoadError(e)).toBe(true);
  });
  it("app/error.tsx 가 자동 새로고침·다시 시도 새로고침을 한다", () => {
    const src = readFileSync("app/error.tsx", "utf8");
    expect(src).toContain("if (isWebpackChunkLoadError(error)) scheduleChunkReloadOnce();");
    expect(src).toContain("onClick={retry}");
    expect(src).toContain("window.location.reload();");
  });
});
