// @vitest-environment jsdom
/**
 * 메신저 홈 부트스트랩(critical·lite·full·fresh) — 화면이 본문까지 읽는 기준으로
 * 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청. 합류한 호출자는 각자 본문을 읽는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true, rooms: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const m = await import("@/lib/community-messenger/cm-bootstrap-client-fetch");
  const readBody = (p: Promise<Response>) => p.then((r) => r.json());
  return {
    critical: () => readBody(m.fetchCommunityMessengerBootstrapCriticalClient()),
    lite: () => readBody(m.fetchCommunityMessengerBootstrapClient("lite")),
    full: () => readBody(m.fetchCommunityMessengerBootstrapClient("full")),
    fresh: () => readBody(m.fetchCommunityMessengerBootstrapClient("fresh")),
  };
}

const names = ["critical", "lite", "full", "fresh"];

describe.each(["header_stall", "body_stall"] as const)("메신저 홈 부트스트랩 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("메신저 홈 부트스트랩 — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청 + 같은 본문", async (name) => {
    const calls = await load();
    const results = await expectConcurrentCallsShareOneRequest(calls[name]);
    expect(results).toEqual([
      { ok: true, rooms: [] },
      { ok: true, rooms: [] },
    ]);
  });

  it("실제 Response(본문 1회 읽기)에서도 합류한 두 호출이 각자 본문을 읽는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [{ id: "r1" }] }), { status: 200 }))
    );
    const m = await import("@/lib/community-messenger/cm-bootstrap-client-fetch");
    const [a, b] = await Promise.all([
      m.fetchCommunityMessengerBootstrapClient("full"),
      m.fetchCommunityMessengerBootstrapClient("full"),
    ]);
    expect(await a.json()).toEqual({ ok: true, rooms: [{ id: "r1" }] });
    expect(await b.json()).toEqual({ ok: true, rooms: [{ id: "r1" }] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("요청 헤더(호출 출처)는 그대로 보낸다", async () => {
    const m = await import("@/lib/community-messenger/cm-bootstrap-client-fetch");
    await m.fetchCommunityMessengerBootstrapClient("full");
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({ "x-samarket-client-call-source": "messenger_bootstrap_full" });
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
  });
});
