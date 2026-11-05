/**
 * 발신자 폴링(v3·v4): 404 만 `notFound`(원격 종료 처리) — 서버 DB 일시 오류 503 은 notFound 가 아니다.
 * (서버가 DB 오류를 404 로 내던 동안에는 일시 오류가 발신 통화 종료로 이어졌다)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { callV4FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v4/call-v4-api";
import { callV3FetchSessionForCallerPoll } from "@/lib/community-messenger/call-v3/call-v3-api";

const SID = "6f106d55-77aa-4b18-b2c8-efe5311751ed";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["v4", callV4FetchSessionForCallerPoll],
  ["v3", callV3FetchSessionForCallerPoll],
])("%s 발신자 폴링 응답 분류", (_name, fetchPoll) => {
  it("503(DB 일시 오류) → notFound 아님", async () => {
    mockFetch(503, { ok: false, error: "call_session_lookup_unavailable" });
    const r = await fetchPoll(SID);
    expect(r.notFound).toBe(false);
    expect(r.session).toBeNull();
    expect(r.httpStatus).toBe(503);
  });

  it("404 → notFound (기존 계약 유지)", async () => {
    mockFetch(404, { ok: false, error: "not_found" });
    expect((await fetchPoll(SID)).notFound).toBe(true);
  });
});
