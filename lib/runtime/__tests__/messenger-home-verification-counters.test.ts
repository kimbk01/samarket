import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";
import { clearBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import {
  fetchCommunityMessengerHomeSilentLists,
  resetCommunityMessengerHomeSilentListsClientStateForTests,
} from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import {
  getMessengerHomeVerificationSnapshot,
  publishMessengerHomeRealtimeMapSnapshot,
  recordMessengerHomeRealtimeReactListenerGaugeDelta,
  recordMessengerHomeRefreshInvocation,
  recordMessengerGlobalBundleSupabaseChannelGaugeDelta,
  recordMessengerHomeSupabaseHomeChannelGaugeDelta,
  resetMessengerHomeVerificationStateForTests,
} from "@/lib/runtime/samarket-runtime-debug";

describe("messenger home verification counters (실행 횟수)", () => {
  beforeEach(() => {
    clearBootstrapCache();
    resetMessengerHomeVerificationStateForTests();
    forgetSingleFlight("community-messenger:client:bootstrap:lite");
    forgetSingleFlight("community-messenger:client:bootstrap:full");
    forgetSingleFlight("community-messenger:client:bootstrap:fresh");
    forgetSingleFlight("community-messenger:client:bootstrap:critical");
    forgetSingleFlight("community-messenger:list-bootstrap-warm");
    forgetSingleFlight("community-messenger:home:silent:home_sync");
    forgetSingleFlight("community-messenger:home:silent:home_sync:critical");
    forgetSingleFlight("community-messenger:home:silent:home_sync:full");
    resetCommunityMessengerHomeSilentListsClientStateForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true, me: null, tabs: {}, friends: [], chats: [], groups: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      )
    );
  });

  afterEach(() => {
    clearBootstrapCache();
    vi.unstubAllGlobals();
    forgetSingleFlight("community-messenger:client:bootstrap:lite");
    forgetSingleFlight("community-messenger:client:bootstrap:full");
    forgetSingleFlight("community-messenger:client:bootstrap:fresh");
    forgetSingleFlight("community-messenger:client:bootstrap:critical");
    forgetSingleFlight("community-messenger:list-bootstrap-warm");
    forgetSingleFlight("community-messenger:home:silent:home_sync");
    forgetSingleFlight("community-messenger:home:silent:home_sync:critical");
    forgetSingleFlight("community-messenger:home:silent:home_sync:full");
    resetCommunityMessengerHomeSilentListsClientStateForTests();
  });

  it("동일 모드 bootstrap: 동시 2호출 → 네트워크 팩토리 1회(lite)", async () => {
    await Promise.all([fetchCommunityMessengerBootstrapClient("lite"), fetchCommunityMessengerBootstrapClient("lite")]);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.bootstrapClientNetworkFetch.lite).toBe(1);
    expect(snap.bootstrapClientNetworkFetch.full).toBe(0);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(1);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("bootstrap: lite 이후 full → 모드별 1회씩(총 2)", async () => {
    await fetchCommunityMessengerBootstrapClient("lite");
    await fetchCommunityMessengerBootstrapClient("full");
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.bootstrapClientNetworkFetch.lite).toBe(1);
    expect(snap.bootstrapClientNetworkFetch.full).toBe(1);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(2);
  });

  it("bootstrap(lite): 캐시가 있으면 네트워크를 다시 호출하지 않는다", async () => {
    primeBootstrapCache({
      me: null,
      tabs: { friends: 0, chats: 1, groups: 0, calls: 0 },
      friends: [],
      following: [],
      hidden: [],
      blocked: [],
      requests: [],
      chats: [],
      groups: [],
      discoverableGroups: [],
      calls: [],
    });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const res = await fetchCommunityMessengerBootstrapClient("lite");
    const json = (await res.json()) as { ok?: boolean; tabs?: { chats?: number } };
    expect(json.ok).toBe(true);
    expect(json.tabs?.chats).toBe(1);
    expect(fetchMock.mock.calls.length).toBe(0);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.bootstrapClientNetworkFetch.lite).toBe(0);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(0);
  });

  it("warm + bootstrap(lite): 동시 호출 → lite 1회(단일 비행)·critical 1회(warm 병렬 prewarm)", async () => {
    vi.stubGlobal("window", {});
    const warmP = new Promise<void>((resolve) => {
      warmMessengerListBootstrapClient();
      setTimeout(resolve, 0);
    });
    await Promise.all([warmP, fetchCommunityMessengerBootstrapClient("lite")]);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.warmCallSiteInvocations).toBe(1);
    expect(snap.bootstrapClientNetworkFetch.lite).toBe(1);
    expect(snap.bootstrapClientNetworkFetch.critical).toBe(1);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(2);
    vi.unstubAllGlobals();
  });

  it("warm: 캐시가 이미 있으면 네트워크를 다시 호출하지 않는다", async () => {
    stubVitestMinimalWindow({
      setTimeout: globalThis.setTimeout.bind(globalThis) as typeof window.setTimeout,
      document: { visibilityState: "visible" as const } as Document,
      navigator: {} as Navigator,
      requestIdleCallback: ((cb: IdleRequestCallback) =>
        Number(globalThis.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 0))) as unknown as Window["requestIdleCallback"],
    });
    primeBootstrapCache({
      me: null,
      tabs: { friends: 0, chats: 0, groups: 0, calls: 0 },
      friends: [],
      following: [],
      hidden: [],
      blocked: [],
      requests: [],
      chats: [],
      groups: [],
      discoverableGroups: [],
      calls: [],
    });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    warmMessengerListBootstrapClient();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock.mock.calls.length).toBe(0);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.warmCallSiteInvocations).toBe(0);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(0);
    vi.unstubAllGlobals();
  });

  it("home-sync: 동시 2호출 → 네트워크 팩토리 1회", async () => {
    await Promise.all([fetchCommunityMessengerHomeSilentLists(), fetchCommunityMessengerHomeSilentLists()]);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.homeSyncNetworkFetch).toBe(1);
  });

  it("home-sync: full tier TTL 내 직렬 호출 → 네트워크 1회·합성 재생 1회", async () => {
    vi.useFakeTimers();
    const first = fetchCommunityMessengerHomeSilentLists({ tier: "full" });
    await vi.runAllTimersAsync();
    await first;
    expect(getMessengerHomeVerificationSnapshot().homeSyncNetworkFetch).toBe(1);
    expect(getMessengerHomeVerificationSnapshot().homeSyncReplaySyntheticReturns).toBe(0);
    vi.advanceTimersByTime(1500);
    const second = fetchCommunityMessengerHomeSilentLists({ tier: "full" });
    await vi.runAllTimersAsync();
    await second;
    expect(getMessengerHomeVerificationSnapshot().homeSyncNetworkFetch).toBe(1);
    expect(getMessengerHomeVerificationSnapshot().homeSyncReplaySyntheticReturns).toBe(1);
    vi.advanceTimersByTime(5000);
    const third = fetchCommunityMessengerHomeSilentLists({ tier: "full" });
    await vi.runAllTimersAsync();
    await third;
    expect(getMessengerHomeVerificationSnapshot().homeSyncNetworkFetch).toBe(2);
    vi.useRealTimers();
  });

  it("home-sync: forceNetwork 는 TTL 재생을 쓰지 않는다", async () => {
    vi.useFakeTimers();
    await fetchCommunityMessengerHomeSilentLists({ tier: "full" });
    await vi.runAllTimersAsync();
    expect(getMessengerHomeVerificationSnapshot().homeSyncNetworkFetch).toBe(1);
    vi.advanceTimersByTime(500);
    await fetchCommunityMessengerHomeSilentLists({ tier: "full", forceNetwork: true });
    await vi.runAllTimersAsync();
    expect(getMessengerHomeVerificationSnapshot().homeSyncNetworkFetch).toBe(2);
    expect(getMessengerHomeVerificationSnapshot().homeSyncReplaySyntheticReturns).toBe(0);
    vi.useRealTimers();
  });

  it("refresh invocation 카운터(수동): silent 2 + nonSilent 1 = total 3", () => {
    recordMessengerHomeRefreshInvocation(true);
    recordMessengerHomeRefreshInvocation(true);
    recordMessengerHomeRefreshInvocation(false);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.refreshInvocationSilent).toBe(2);
    expect(snap.refreshInvocationNonSilent).toBe(1);
    expect(snap.refreshInvocationTotal).toBe(3);
  });

  it("subscribe 게이지(수동): +1,+1,-1 → 활성 1 → -1 로 0", () => {
    recordMessengerHomeRealtimeReactListenerGaugeDelta(1);
    recordMessengerHomeRealtimeReactListenerGaugeDelta(1);
    expect(getMessengerHomeVerificationSnapshot().homeRealtimeReactListenerDepth).toBe(2);
    recordMessengerHomeRealtimeReactListenerGaugeDelta(-1);
    expect(getMessengerHomeVerificationSnapshot().homeRealtimeReactListenerDepth).toBe(1);
    recordMessengerHomeRealtimeReactListenerGaugeDelta(-1);
    expect(getMessengerHomeVerificationSnapshot().homeRealtimeReactListenerDepth).toBe(0);
  });

  it("Supabase 채널 핸들 게이지: +5 후 -5 → 0", () => {
    recordMessengerHomeSupabaseHomeChannelGaugeDelta(5);
    expect(getMessengerHomeVerificationSnapshot().homeRealtimeSupabaseChannelDepth).toBe(5);
    recordMessengerHomeSupabaseHomeChannelGaugeDelta(-5);
    expect(getMessengerHomeVerificationSnapshot().homeRealtimeSupabaseChannelDepth).toBe(0);
  });

  it("글로벌 방 번들 채널 게이지: +3 후 -3 → 0", () => {
    recordMessengerGlobalBundleSupabaseChannelGaugeDelta(3);
    expect(getMessengerHomeVerificationSnapshot().messengerGlobalBundleSupabaseChannelDepth).toBe(3);
    recordMessengerGlobalBundleSupabaseChannelGaugeDelta(-3);
    expect(getMessengerHomeVerificationSnapshot().messengerGlobalBundleSupabaseChannelDepth).toBe(0);
  });

  it("맵 스냅샷: entries/listenerRefs 수동 반영", () => {
    publishMessengerHomeRealtimeMapSnapshot(1, 2);
    const s = getMessengerHomeVerificationSnapshot();
    expect(s.homeRealtimeMapEntries).toBe(1);
    expect(s.homeRealtimeMapListenerRefs).toBe(2);
  });
});
