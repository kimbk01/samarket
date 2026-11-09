import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0-B 계정 격리 — Owner 지정 시나리오:
 * A 로그인 → 주문 조회 → 로그아웃 → B 로그인 / 같은 주문 ID·배송지 ID 로 A 데이터 노출 0 /
 * 로그아웃 직전 시작된 응답의 늦은 도착 / 반복 로그인·로그아웃 / 정상 주문 조회 회귀.
 */
const BOUND_KEY = "dibay:auth_bound_user_id";

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

type Pending = { resolve: (r: Response) => void; url: string };

describe("배달 개인 캐시 — 계정 격리", () => {
  let ls: ReturnType<typeof makeLocalStorage>;
  let pending: Pending[];
  let fetchSpy: ReturnType<typeof vi.fn>;

  function login(userId: string) {
    ls.setItem(BOUND_KEY, userId);
  }
  function respond(i: number, body: unknown) {
    pending[i]!.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }

  beforeEach(() => {
    vi.resetModules();
    ls = makeLocalStorage();
    pending = [];
    fetchSpy = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          pending.push({ resolve, url: String(url) });
        })
    );
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", {
      localStorage: ls,
      location: { pathname: "/" },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("A 주문 상세 → 로그아웃 → B 같은 주문 ID 조회 시 A 캐시 노출 0 (네트워크로 다시 받음)", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const pA = api.fetchMeStoreOrderDetailDeduped("order-1");
    await flush();
    respond(0, { ok: true, owner: "A" });
    expect((await pA).json).toEqual({ ok: true, owner: "A" });
    expect(api.peekMeStoreOrderDetailCache("order-1")?.json).toEqual({ ok: true, owner: "A" });

    api.wipeDeliveryPrivateClientCaches(); // 로그아웃
    ls.removeItem(BOUND_KEY);
    login("user-b");
    expect(api.peekMeStoreOrderDetailCache("order-1")).toBeNull();

    const pB = api.fetchMeStoreOrderDetailDeduped("order-1");
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    respond(1, { ok: true, owner: "B" });
    expect((await pB).json).toEqual({ ok: true, owner: "B" });
  });

  it("wipe 없이 계정만 바뀌어도(사용자 ID 범위) 이전 계정 캐시에 닿지 않음", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const p = api.fetchMeStoreOrderEventsDeduped("order-9");
    await flush();
    respond(0, { ok: true, owner: "A" });
    await p;
    login("user-b");
    expect(api.peekMeStoreOrderEventsCache("order-9")).toBeNull();
  });

  it("로그아웃 직전 시작된 응답이 늦게 도착하면 캐시·결과 모두 폐기, B 의 같은 요청은 합류하지 않음", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const pA = api.fetchMeStoreOrderDetailDeduped("order-1");
    await flush();
    api.wipeDeliveryPrivateClientCaches();
    login("user-b");
    const pB = api.fetchMeStoreOrderDetailDeduped("order-1");
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // B 는 A 의 진행 중 요청에 합류하지 않는다
    respond(0, { ok: true, owner: "A" }); // A 응답 늦게 도착
    const lateA = await pA;
    expect(lateA.status).toBe(api.DELIVERY_PRIVATE_SCOPE_CHANGED_STATUS);
    expect(api.peekMeStoreOrderDetailCache("order-1")).toBeNull();
    respond(1, { ok: true, owner: "B" });
    expect((await pB).json).toEqual({ ok: true, owner: "B" });
    expect(api.peekMeStoreOrderDetailCache("order-1")?.json).toEqual({ ok: true, owner: "B" });
  });

  it("배송지 ETA: 같은 매장·배송지 ID 라도 계정이 바뀌면 이전 ETA 노출 0", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const p = api.fetchStoreDeliveryEtaDeduped("shop", "addr-1", { language: "ko" });
    await flush();
    respond(0, { ok: true, eta: "A" });
    await p;
    api.wipeDeliveryPrivateClientCaches();
    login("user-b");
    const pB = api.fetchStoreDeliveryEtaDeduped("shop", "addr-1", { language: "ko" });
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    respond(1, { ok: true, eta: "B" });
    expect((await pB).json).toEqual({ ok: true, eta: "B" });
  });

  it("허브 요약: 로그아웃 후 이전 계정 요약 peek 0", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const p = api.fetchMeStoreOrdersHubSummaryDeduped();
    await flush();
    respond(0, { ok: true, owner: "A" });
    await p;
    expect(api.peekMeStoreOrdersHubSummaryCache()?.json).toEqual({ ok: true, owner: "A" });
    api.wipeDeliveryPrivateClientCaches();
    expect(api.peekMeStoreOrdersHubSummaryCache()).toBeNull();
  });

  it("반복 로그인·로그아웃 20회 후에도 남는 항목 없음(현재 계정 1건만)", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    for (let i = 0; i < 20; i += 1) {
      login(`user-${i}`);
      const p = api.fetchMeStoreOrderDetailDeduped("order-x");
      await flush();
      respond(pending.length - 1, { ok: true, owner: i });
      await p;
      api.wipeDeliveryPrivateClientCaches();
    }
    login("user-final");
    expect(api.peekMeStoreOrderDetailCache("order-x")).toBeNull();
  });

  it("정상 조회 회귀: 같은 계정 연속 조회는 캐시·단일 비행 유지(네트워크 1회)", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    login("user-a");
    const p1 = api.fetchMeStoreOrderDetailDeduped("order-1");
    const p2 = api.fetchMeStoreOrderDetailDeduped("order-1");
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    respond(0, { ok: true, owner: "A" });
    expect((await p1).json).toEqual((await p2).json);
    const p3 = await api.fetchMeStoreOrderDetailDeduped("order-1");
    expect(p3.json).toEqual({ ok: true, owner: "A" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("배선 계약 — 로그아웃·계정 전환·세션 없음 공통 경로가 폐기를 호출", () => {
  it("invalidateAuthExitClientCaches 가 wipeDeliveryPrivateClientCaches 를 호출", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/auth/invalidate-auth-exit-client-caches.ts", "utf8");
    expect(src).toContain("wipeDeliveryPrivateClientCaches();");
  });
});

describe("409 소비처 — 원시 코드 노출 금지(G3 결함 수정)", () => {
  it("isDeliveryPrivateScopeChangedResponse 는 범위 변경 응답만 참", async () => {
    const api = await import("@/lib/stores/store-delivery-api-client");
    expect(api.isDeliveryPrivateScopeChangedResponse({ status: 409, json: { ok: false, error: "auth_scope_changed" } })).toBe(true);
    expect(api.isDeliveryPrivateScopeChangedResponse({ status: 409, json: { ok: false, error: "other" } })).toBe(false);
    expect(api.isDeliveryPrivateScopeChangedResponse({ status: 401, json: { ok: false, error: "auth_scope_changed" } })).toBe(false);
  });
  it("채팅 상단(ChatDetailView)·메신저 주문 시트 스냅샷 훅은 범위 변경 응답으로 상태·오류를 바꾸지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["components/chats/ChatDetailView.tsx", "lib/store-order-chat/use-store-order-room-snapshot.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("if (isDeliveryPrivateScopeChangedResponse(detailRes)) return;");
    }
  });
});
