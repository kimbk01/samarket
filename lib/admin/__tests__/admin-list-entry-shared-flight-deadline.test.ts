// @vitest-environment jsdom
/**
 * 관리자 배달 알림함·매장 심사 목록 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청.
 * 알림함 동시 호출은 1회 요청 + 두 호출 모두 같은 파싱 결과.
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
  installStallFetch({ ok: true, notifications: [{ id: "n1" }], stores: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const m = await import("@/lib/admin/fetch-admin-list-entry-client");
  const { runSingleFlight } = await import("@/lib/http/run-single-flight");
  return {
    delivery_inbox: () => m.fetchAdminDeliveryInboxShared(),
    stores_realtime_refresh: () =>
      runSingleFlight("admin:stores:realtime-refresh", () => m.fetchAdminStoresReviewList("?page=1")),
  };
}

describe.each(["header_stall", "body_stall"] as const)("관리자 주요 목록 — %s", (kind) => {
  it.each(["delivery_inbox", "stores_realtime_refresh"])("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("관리자 주요 목록 — 정상 경로 보존", () => {
  it("알림함: 동시 호출 1회 요청 + 두 호출 모두 같은 목록", async () => {
    const calls = await load();
    const results = (await expectConcurrentCallsShareOneRequest(calls.delivery_inbox)) as {
      status: number;
      json: { ok?: boolean; notifications?: unknown[] };
    }[];
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.status).toBe(200);
      expect(r.json.ok).toBe(true);
      expect(r.json.notifications).toEqual([{ id: "n1" }]);
    }
  });

  it("알림함: 실제 Response(본문 1회 읽기)에서도 동시 호출 둘 다 목록을 받는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, notifications: [{ id: "n1" }] }), { status: 200 }))
    );
    const m = await import("@/lib/admin/fetch-admin-list-entry-client");
    const [a, b] = await Promise.all([m.fetchAdminDeliveryInboxShared(), m.fetchAdminDeliveryInboxShared()]);
    expect(a.json).toEqual({ ok: true, notifications: [{ id: "n1" }] });
    expect(b.json).toEqual({ ok: true, notifications: [{ id: "n1" }] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("매장 심사 목록: 정상 응답은 상태·본문 그대로", async () => {
    const m = await import("@/lib/admin/fetch-admin-list-entry-client");
    const r = await m.fetchAdminStoresReviewList("?page=1");
    expect(r).toEqual({ status: 200, json: { ok: true, notifications: [{ id: "n1" }], stores: [] } });
  });
});
