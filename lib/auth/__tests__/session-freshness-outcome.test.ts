import { describe, expect, it } from "vitest";
import { classifySessionResult } from "@/lib/auth/session-freshness-fetch-gate.client";

const NOW = 1_800_000_000_000;
const sec = (ms: number) => Math.floor(ms / 1000);

describe("classifySessionResult — 조정자 전용 세션 판정", () => {
  it("갱신된 세션(만료 90초 초과) → refreshed", () => {
    expect(classifySessionResult({ data: { session: { expires_at: sec(NOW + 3_600_000) } } }, NOW)).toBe("refreshed");
  });
  it("여전히 만료 임박 → error(미확정)", () => {
    expect(classifySessionResult({ data: { session: { expires_at: sec(NOW + 30_000) } } }, NOW)).toBe("error");
  });
  it("세션 사라짐 → invalid", () => {
    expect(classifySessionResult({ data: { session: null } }, NOW)).toBe("invalid");
  });
  it("무효 코드 → invalid", () => {
    for (const code of ["refresh_token_not_found", "refresh_token_already_used", "session_not_found"]) {
      expect(classifySessionResult({ error: { code } }, NOW)).toBe("invalid");
    }
  });
  it("그 밖의 오류(네트워크·5xx) → error", () => {
    expect(classifySessionResult({ error: { code: "", status: 503 } }, NOW)).toBe("error");
  });
});
