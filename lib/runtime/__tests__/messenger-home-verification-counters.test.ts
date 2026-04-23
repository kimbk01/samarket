import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import { fetchCommunityMessengerHomeSilentLists } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import {
  getMessengerHomeVerificationSnapshot,
  publishMessengerHomeRealtimeMapSnapshot,
  recordMessengerHomeRealtimeReactListenerGaugeDelta,
  recordMessengerHomeRefreshInvocation,
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
    forgetSingleFlight("community-messenger:list-bootstrap-warm");
    forgetSingleFlight("community-messenger:home:silent:home_sync");
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
    forgetSingleFlight("community-messenger:list-bootstrap-warm");
    forgetSingleFlight("community-messenger:home:silent:home_sync");
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

  it("warm + bootstrap(lite): 동시 호출 → lite 네트워크 1회(내부 동일 단일 비행 키)", async () => {
    vi.stubGlobal("window", {});
    const warmP = new Promise<void>((resolve) => {
      warmMessengerListBootstrapClient();
      setTimeout(resolve, 0);
    });
    await Promise.all([warmP, fetchCommunityMessengerBootstrapClient("lite")]);
    const snap = getMessengerHomeVerificationSnapshot();
    expect(snap.warmCallSiteInvocations).toBe(1);
    expect(snap.bootstrapClientNetworkFetch.lite).toBe(1);
    expect(snap.bootstrapClientNetworkFetchTotal).toBe(1);
    vi.unstubAllGlobals();
  });

  it("warm: 캐시가 이미 있으면 네트워크를 다시 호출하지 않는다", async () => {
    vi.stubGlobal("window", {});
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

  it("맵 스냅샷: entries/listenerRefs 수동 반영", () => {
    publishMessengerHomeRealtimeMapSnapshot(1, 2);
    const s = getMessengerHomeVerificationSnapshot();
    expect(s.homeRealtimeMapEntries).toBe(1);
    expect(s.homeRealtimeMapListenerRefs).toBe(2);
  });
});
