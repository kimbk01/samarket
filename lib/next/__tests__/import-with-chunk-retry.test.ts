import { describe, expect, it, vi } from "vitest";
import { isWebpackChunkLoadError } from "@/lib/next/import-with-chunk-retry";

describe("import-with-chunk-retry", () => {
  it("ChunkLoadError 이름 인식", () => {
    const e = new Error("Loading chunk 9 failed");
    e.name = "ChunkLoadError";
    expect(isWebpackChunkLoadError(e)).toBe(true);
  });

  it("dynamic import 메시지 인식", () => {
    expect(
      isWebpackChunkLoadError(new Error("Failed to fetch dynamically imported module: http://x/chunk.js"))
    ).toBe(true);
  });

  it("일반 오류는 제외", () => {
    expect(isWebpackChunkLoadError(new Error("network"))).toBe(false);
  });
});
