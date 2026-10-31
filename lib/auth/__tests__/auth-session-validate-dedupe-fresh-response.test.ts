/**
 * 동시에 합류한 세션 검증 실패가 Response 1개를 공유하면, 먼저 보낸 요청이 body 를 잠가
 * 다음 요청이 「failed to pipe response」 500 이 된다 (2026-10-31 운영 POST messages).
 * 실패 응답은 호출자마다 새로 만들어야 한다.
 */
import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSessionLight: async () => {
    await new Promise((r) => setTimeout(r, 20));
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "로그인이 필요합니다.", authenticated: false },
        { status: 401, headers: { "x-test": "1" } }
      ),
    };
  },
}));
vi.mock("@/lib/auth/auth-session-response-cache", () => ({
  peekAuthSessionValidatedOk: () => false,
  setAuthSessionValidatedOk: () => {},
}));
vi.mock("@/lib/auth/auth-session-validate-cache", () => ({
  peekAuthSessionValidateCached: () => false,
  setAuthSessionValidateCached: () => {},
}));
vi.mock("@/lib/auth/auth-light-session-snapshot-cache", () => ({
  peekAuthLightSessionSnapshot: () => ({ hit: false }),
}));
vi.mock("@/lib/auth/auth-hot-path-breakdown", () => ({ logAuthDedupeWarmBreakdown: () => {} }));

import { validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";

describe("validateActiveSessionLightDeduped — 실패 응답은 호출자마다 새로", () => {
  it("동시 2회: 서로 다른 Response, 둘 다 읽을 수 있고 401·본문·헤더 유지", async () => {
    const [a, b] = await Promise.all([
      validateActiveSessionLightDeduped("u1", "sess-1"),
      validateActiveSessionLightDeduped("u1", "sess-1"),
    ]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.response).not.toBe(b.response);
    const ja = await a.response.json();
    expect(b.response.bodyUsed).toBe(false);
    const jb = await b.response.json();
    expect(a.response.status).toBe(401);
    expect(b.response.status).toBe(401);
    expect(ja).toEqual({ ok: false, error: "로그인이 필요합니다.", authenticated: false });
    expect(jb).toEqual(ja);
    expect(b.response.headers.get("x-test")).toBe("1");
  });
});
