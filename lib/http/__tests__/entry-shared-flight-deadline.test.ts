// @vitest-environment jsdom
/**
 * A1 — 진입 화면 공유 요청(배달 홈 피드·메신저 방 진입 bootstrap·거래 홈 목록) 무기한 대기 방지.
 * 실제 진입 함수를 그대로 호출하고 네트워크(fetch)만 대체한다. stub 은 실제 fetch 처럼 signal abort 시에만 reject 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Behavior = "ok" | "header_stall" | "body_stall" | "network_error" | "status_500" | "status_401";
let behavior: Behavior = "ok";
let fetchCalls = 0;
const fetchSignals: (AbortSignal | undefined)[] = [];

function stall(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

function okBody(url: string): unknown {
  if (url.includes("/api/stores/home-feed")) return { ok: true, stores: [{ id: "s1" }], meta: {} };
  if (url.includes("/bootstrap")) return { ok: false };
  return { posts: [{ id: "p1" }], hasMore: false, favoriteMap: {} };
}

function clearDeviceCaches(): void {
  sessionStorage.clear();
  localStorage.clear();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  clearDeviceCaches();
  behavior = "ok";
  fetchCalls = 0;
  fetchSignals.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      fetchCalls += 1;
      fetchSignals.push(init.signal ?? undefined);
      if (behavior === "header_stall") return stall(init.signal);
      if (behavior === "network_error") return Promise.reject(new TypeError("Failed to fetch"));
      const status = behavior === "status_500" ? 500 : behavior === "status_401" ? 401 : 200;
      return Promise.resolve({
        ok: status === 200,
        status,
        headers: new Headers(),
        json: () => (behavior === "body_stall" ? stall(init.signal) : Promise.resolve(okBody(url))),
        text: () => (behavior === "body_stall" ? stall(init.signal) : Promise.resolve(JSON.stringify(okBody(url)))),
      } as unknown as Response);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function outcome(p: Promise<unknown>, ms: number): Promise<{ settled: boolean; error: unknown; value: unknown }> {
  const state = { settled: false, error: undefined as unknown, value: undefined as unknown };
  p.then(
    (v) => {
      state.settled = true;
      state.value = v;
    },
    (e) => {
      state.settled = true;
      state.error = e;
    },
  );
  await vi.advanceTimersByTimeAsync(ms);
  return state;
}

const DEADLINE = 12_000;

type Entry = {
  name: string;
  call: (signal?: AbortSignal) => Promise<unknown>;
  /** 마감 초과·중단 시 결과 — throw(배달·메신저) 또는 실패 결과(거래 `failed:true`) */
  stalledResolvesAsFailed: boolean;
};

async function entries(): Promise<Entry[]> {
  const stores = await import("@/lib/stores/store-delivery-api-client");
  const cm = await import("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client");
  const trade = await import("@/lib/posts/getPostsForHome");
  return [
    {
      name: "stores_home_feed",
      call: (signal) => stores.fetchStoresHomeFeedDeduped("?audit=1", { language: "ko", signal }),
      stalledResolvesAsFailed: false,
    },
    {
      name: "cm_room_entry_bootstrap",
      call: () => cm.fetchCommunityMessengerRoomBootstrapClient("room-audit", { viewerUserId: "" }),
      stalledResolvesAsFailed: false,
    },
    {
      name: "trade_home_posts",
      call: () => trade.getPostsForHome({ locationAll: true } as Parameters<typeof trade.getPostsForHome>[0]),
      stalledResolvesAsFailed: true,
    },
  ];
}

describe.each(["header_stall", "body_stall"] as const)("A1 — %s", (stallKind) => {
  it("세 진입 함수 모두 마감 안에 종료하고 실제 네트워크를 끊으며, 재진입은 새 요청을 보낸다", async () => {
    for (const entry of await entries()) {
      behavior = stallKind;
      clearDeviceCaches();
      const callsBefore = fetchCalls;
      const first = await outcome(entry.call(), DEADLINE + 50);
      expect(first.settled, `${entry.name} settled`).toBe(true);
      const sharedSignal = fetchSignals[fetchSignals.length - 1];
      expect(sharedSignal?.aborted, `${entry.name} network aborted`).toBe(true);
      if (entry.stalledResolvesAsFailed) {
        expect((first.value as { failed?: boolean }).failed, entry.name).toBe(true);
      } else {
        expect((first.error as Error)?.name, entry.name).toBe("SharedFlightDeadlineError");
        /** 호출처가 「화면 이탈 취소」로 오인하지 않도록 AbortError 와 구분 */
        expect(first.error instanceof DOMException, entry.name).toBe(false);
      }
      behavior = "ok";
      clearDeviceCaches();
      const retry = await outcome(entry.call(), 100);
      expect(fetchCalls - callsBefore, `${entry.name} retry is a new request`).toBe(2);
      expect(retry.settled && retry.error === undefined, entry.name).toBe(true);
    }
  });
});

describe("A1 — 정상·오류 경로 보존", () => {
  it("정상 응답은 마감 전에 그대로 반환된다", async () => {
    const [stores, , trade] = await entries();
    const s = await outcome(stores.call(), 10);
    expect(s.value).toMatchObject({ status: 200, json: { ok: true } });
    const t = await outcome(trade.call(), 10);
    expect((t.value as { posts: unknown[]; failed?: boolean }).posts).toHaveLength(1);
    expect((t.value as { failed?: boolean }).failed).toBeUndefined();
  });

  it("동시 호출은 하나의 네트워크 요청을 공유한다 (정상 중복 합류 유지)", async () => {
    for (const entry of await entries()) {
      clearDeviceCaches();
      const before = fetchCalls;
      const results = await Promise.all([entry.call(), entry.call(), entry.call()]);
      expect(fetchCalls - before, entry.name).toBe(1);
      expect(results[0]).toEqual(results[1]);
    }
  });

  it("한 호출자의 취소는 공유 네트워크 요청과 다른 호출자를 끊지 않는다 (배달 홈)", async () => {
    const [stores] = await entries();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        fetchCalls += 1;
        fetchSignals.push(init.signal ?? undefined);
        await gate;
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, stores: [] }) } as unknown as Response;
      }),
    );
    const leaving = new AbortController();
    const a = stores.call(leaving.signal).catch((e: unknown) => e);
    const b = stores.call();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCalls).toBe(1);
    leaving.abort();
    expect(((await a) as DOMException).name).toBe("AbortError");
    expect(fetchSignals[0]?.aborted).toBe(false);
    release();
    await expect(b).resolves.toMatchObject({ status: 200 });
    expect(fetchCalls).toBe(1);
  });

  it("네트워크 오류는 즉시 오류로 끝나고 재시도는 새 요청이다", async () => {
    for (const entry of await entries()) {
      behavior = "network_error";
      clearDeviceCaches();
      const before = fetchCalls;
      const r = await outcome(entry.call(), 10);
      expect(r.settled, entry.name).toBe(true);
      if (entry.stalledResolvesAsFailed) expect((r.value as { failed?: boolean }).failed, entry.name).toBe(true);
      else expect((r.error as Error).name, entry.name).toBe("TypeError");
      behavior = "ok";
      clearDeviceCaches();
      await outcome(entry.call(), 10);
      expect(fetchCalls - before, entry.name).toBe(2);
    }
  });

  it("인증 오류(401)는 마감·네트워크 오류와 구분되어 상태 코드로 전달된다", async () => {
    const [stores, cm, trade] = await entries();
    behavior = "status_401";
    expect((await outcome(stores.call(), 10)).value).toMatchObject({ status: 401 });
    expect((await outcome(cm.call(), 10)).value).toBeNull();
    expect(((await outcome(trade.call(), 10)).value as { failed?: boolean }).failed).toBe(true);
  });
});

describe("대조군 — 기존 수정(내정보 프로필)", () => {
  it.each(["header_stall", "body_stall"] as const)("fetchMeProfileDeduped %s 는 마감 후 정리된다", async (kind) => {
    behavior = kind;
    const api = await import("@/lib/profile/fetch-me-profile-deduped");
    const r = await outcome(api.fetchMeProfileDeduped(), 12_100);
    expect(r.settled).toBe(true);
  });
});
