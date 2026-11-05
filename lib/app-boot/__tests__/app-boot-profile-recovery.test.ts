/** @vitest-environment jsdom */
/**
 * 2단계 — 앱 시작 lite 프로필 무한 대기 제거 · 로그인 사용자 `error`(≠ anonymous) · 단일 복구 · 초기화 1회.
 * 실제 app-boot-store / fetch-app-boot-profile(마감 시간) / schedule-app-boot-background 를 쓰고
 * 네트워크·인증 경계만 mock 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/profile/types";

const dedupeSupabaseAuthGetUser = vi.fn();
const recoverFrom401Once = vi.fn();
const runRecoverableGuestRecovery = vi.fn();
const fetchAuthSessionNoStore = vi.fn();
const markSessionTerminalGuestFromClient = vi.fn();
const markSessionRecoveringFromClient = vi.fn();
const setSupabaseProfileCache = vi.fn();
const armNotificationSoundSsotFirstLoad = vi.fn();
const ensureInitialBadgeSnapshotForBoot = vi.fn(() => Promise.resolve());
const enableOwnerHubBadgeBackgroundHydration = vi.fn();
const getCurrentUser = vi.fn(() => null as { id: string } | null);

vi.mock("@/lib/auth/dedupe-supabase-get-user-client", () => ({
  dedupeSupabaseAuthGetUser: (...a: unknown[]) => dedupeSupabaseAuthGetUser(...a),
}));
vi.mock("@/lib/auth/api-auth-recovery", () => ({
  recoverFrom401Once: (...a: unknown[]) => recoverFrom401Once(...a),
}));
vi.mock("@/lib/auth/guest-auth-recovery", () => ({
  runRecoverableGuestRecovery: (...a: unknown[]) => runRecoverableGuestRecovery(...a),
}));
vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...a: unknown[]) => fetchAuthSessionNoStore(...a),
}));
vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: () => Promise.resolve(),
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  markSessionTerminalGuestFromClient: (...a: unknown[]) => markSessionTerminalGuestFromClient(...a),
  markSessionRecoveringFromClient: (...a: unknown[]) => markSessionRecoveringFromClient(...a),
}));
vi.mock("@/lib/auth/guest-auth-boot-markers", () => ({ logGuestAuthBootMarker: () => {} }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: {} }) }));
vi.mock("@/lib/auth/supabase-profile-cache", () => ({
  setSupabaseProfileCache: (...a: unknown[]) => setSupabaseProfileCache(...a),
  userToProfile: (u: { id: string }) => ({ id: u.id }),
}));
vi.mock("@/lib/auth/test-auth-store", () => ({ dispatchTestAuthChanged: () => {} }));
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/hooks/use-client-membership-state", () => ({ primeMembershipOnBoot: () => Promise.resolve() }));
vi.mock("@/lib/startup/startup-metrics", () => ({ markBootMetricsApiDone: () => {} }));
vi.mock("@/lib/app-boot/client-boot-request-journal", () => ({ recordBootVerifyFetch: () => {} }));
vi.mock("@/lib/dibay/shell-fetch-trace", () => ({ logShellFetchTrace: () => {} }));
vi.mock("@/lib/http/startup-api-scheduler", () => ({
  logStartupApiPlan: () => {},
  scheduleStartupApiDeferred: (_key: string, run: () => void) => {
    run();
    return () => {};
  },
}));
vi.mock("@/lib/notifications/notification-sound-ssot-client-hydrate", () => ({
  armNotificationSoundSsotFirstLoad: (...a: unknown[]) => armNotificationSoundSsotFirstLoad(...a),
}));
vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  ensureInitialBadgeSnapshotForBoot: (...a: unknown[]) => ensureInitialBadgeSnapshotForBoot(...(a as [])),
}));
vi.mock("@/lib/notifications/member-badge-surface-authority", () => ({ isMemberBadgeAuthoritySurface: () => true }));
vi.mock("@/lib/chats/owner-hub-badge-store", () => ({
  enableOwnerHubBadgeBackgroundHydration: () => enableOwnerHubBadgeBackgroundHydration(),
}));
vi.mock("@/lib/business/owner-hub-path", () => ({ isStoreOwnerHubPathname: () => false }));

const PROFILE = { id: "u1", nickname: "member", region_code: null, region_name: null } as unknown as ProfileRow;
const USER = { id: "u1" };

type Responder = (init: RequestInit) => Promise<Response>;

function okProfile(profile: ProfileRow = PROFILE): Responder {
  return () => Promise.resolve(new Response(JSON.stringify({ ok: true, profile }), { status: 200 }));
}
function status401(): Responder {
  return () => Promise.resolve(new Response(JSON.stringify({ ok: false, authenticated: false }), { status: 401 }));
}
function networkError(): Responder {
  return () => Promise.reject(new TypeError("Failed to fetch"));
}
function abortRejection(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}
function headerStall(): Responder {
  return (init) => abortRejection(init.signal);
}
function bodyStall(): Responder {
  return (init) =>
    Promise.resolve({ ok: true, status: 200, json: () => abortRejection(init.signal) } as unknown as Response);
}
function deferred(): { responder: Responder; resolve: (r: Response) => void } {
  let resolve!: (r: Response) => void;
  const p = new Promise<Response>((r) => {
    resolve = r;
  });
  return { responder: () => p, resolve };
}

let liteQueue: Responder[] = [];
let liteDefault: Responder = networkError();
let liteCalls = 0;
let fullCalls = 0;
let readyEvents = 0;
let profileUpdatedEvents = 0;
let statuses: string[] = [];

type Mods = {
  run: typeof import("@/lib/app-boot/run-app-boot");
  store: typeof import("@/lib/app-boot/app-boot-store");
  liteCache: typeof import("@/lib/app-boot/fetch-app-boot-profile");
  guest: typeof import("@/lib/auth/guest-auth-state");
};
let mods: Mods | null = null;
let removeEventCounters: (() => void) | null = null;

async function load(): Promise<Mods> {
  const [run, store, liteCache, guest] = await Promise.all([
    import("@/lib/app-boot/run-app-boot"),
    import("@/lib/app-boot/app-boot-store"),
    import("@/lib/app-boot/fetch-app-boot-profile"),
    import("@/lib/auth/guest-auth-state"),
  ]);
  const types = await import("@/lib/app-boot/app-boot-types");
  const onReady = () => {
    readyEvents += 1;
  };
  const onProfileUpdated = () => {
    profileUpdatedEvents += 1;
  };
  window.addEventListener(types.APP_BOOT_READY_EVENT, onReady);
  window.addEventListener(types.APP_BOOT_PROFILE_UPDATED_EVENT, onProfileUpdated);
  removeEventCounters = () => {
    window.removeEventListener(types.APP_BOOT_READY_EVENT, onReady);
    window.removeEventListener(types.APP_BOOT_PROFILE_UPDATED_EVENT, onProfileUpdated);
  };
  store.subscribeAppBoot(() => {
    statuses.push(store.getAppBootSnapshot().status);
  });
  mods = { run, store, liteCache, guest };
  return mods;
}

/** 로그아웃과 같은 무효화 — `invalidateAppBootAll` 의 boot 관련 부분 */
function logout(m: Mods): void {
  m.run.invalidateAppBootFlight();
  m.liteCache.invalidateAppBootProfileCache();
  m.store.resetAppBootStore();
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  liteQueue = [];
  liteDefault = networkError();
  liteCalls = 0;
  fullCalls = 0;
  readyEvents = 0;
  profileUpdatedEvents = 0;
  statuses = [];
  setVisibility("visible");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.includes("lite=1")) {
        liteCalls += 1;
        return (liteQueue.shift() ?? liteDefault)(init);
      }
      if (url.includes("mode=full")) {
        fullCalls += 1;
        return okProfile()(init);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }),
  );
  for (const fn of [
    dedupeSupabaseAuthGetUser,
    recoverFrom401Once,
    runRecoverableGuestRecovery,
    fetchAuthSessionNoStore,
    markSessionTerminalGuestFromClient,
    markSessionRecoveringFromClient,
    setSupabaseProfileCache,
    armNotificationSoundSsotFirstLoad,
    ensureInitialBadgeSnapshotForBoot,
    enableOwnerHubBadgeBackgroundHydration,
  ]) {
    fn.mockClear();
  }
  dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: USER }, error: null });
  getCurrentUser.mockReturnValue(null);
});

afterEach(() => {
  /** 이전 모듈 인스턴스의 online·visibility 리스너가 다음 테스트에서 실행되지 않게 idle 로 둔다 */
  if (mods) logout(mods);
  mods = null;
  removeEventCounters?.();
  removeEventCounters = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("앱 시작 lite 프로필 — 설계 시나리오 10종", () => {
  it("1) 로그인 + lite 정상 → ready·프로필·초기화 1회", async () => {
    liteDefault = okProfile();
    const m = await load();
    await m.run.ensureAppBoot();
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    expect(m.store.peekAppBootProfile()?.id).toBe("u1");
    expect(m.guest.isGuestAuthEstablished()).toBe(false);
    expect(liteCalls).toBe(1);
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledTimes(1);
    expect(ensureInitialBadgeSnapshotForBoot).toHaveBeenCalledTimes(1);
    expect(enableOwnerHubBadgeBackgroundHydration).toHaveBeenCalledTimes(1);
  });

  it("2) 로그인 + lite 헤더 12초 정지 → error(비회원 아님)·공유 대기열 해제", async () => {
    liteQueue = [headerStall()];
    liteDefault = headerStall();
    const m = await load();
    let settled = false;
    void m.run.ensureAppBoot().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(11_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(settled).toBe(true);
    const snap = m.store.getAppBootSnapshot();
    expect(snap.status).toBe("error");
    expect(snap.profile).toBeNull();
    expect(m.store.isAppBootReady()).toBe(false);
    expect(readyEvents).toBe(0);
    expect(m.guest.isGuestAuthEstablished()).toBe(false);
    expect(markSessionTerminalGuestFromClient).not.toHaveBeenCalled();
    expect(m.liteCache.peekAppBootProfileFetchCached()).toBeNull();
    /** 다음 복구는 새 요청 — 정지된 요청에 합류하지 않는다 */
    liteDefault = okProfile();
    await m.run.requestAppBootProfileRecovery();
    expect(liteCalls).toBe(2);
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
  });

  it("3) 로그인 + lite 본문 읽기 정지 → 12초에 error", async () => {
    liteQueue = [bodyStall()];
    const m = await load();
    void m.run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(12_000);
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    expect(m.guest.isGuestAuthEstablished()).toBe(false);
  });

  it("4) 로그인 만료(getUser 없음) + lite 실패 → 기존 비회원 확정 경로, 복구 재시도 없음", async () => {
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue({ ok: false, status: 401 });
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("anonymous");
    expect(m.guest.isTerminalGuestAuthEstablished()).toBe(true);
    expect(markSessionTerminalGuestFromClient).toHaveBeenCalledWith("app_boot_unauthenticated_confirmed");
    const calls = liteCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(liteCalls).toBe(calls);
  });

  it("5) 앱 시작 실패 후 /mypage 진입 → 명시 복구가 즉시 새 요청(1.5초 대기 없음)", async () => {
    liteQueue = [networkError(), okProfile()];
    const m = await load();
    await m.run.ensureAppBoot();
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    await m.run.requestAppBootProfileRecovery();
    await flush();
    expect(liteCalls).toBe(2);
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    /** 예약돼 있던 자동 재시도는 취소 — 추가 요청 없음 */
    await vi.advanceTimersByTimeAsync(30_000);
    expect(liteCalls).toBe(2);
  });

  it("6) /mypage 에서 네트워크 복구(online) → 복구", async () => {
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(1_500 + 3_000 + 6_000);
    expect(liteCalls).toBe(4);
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    liteDefault = okProfile();
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(liteCalls).toBe(5);
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
  });

  it("7) 앱 시작 복구와 full 프로필 조회 동시 → full 은 lite 를 기다리고 중복 요청 없음", async () => {
    liteQueue = [networkError()];
    const m = await load();
    await m.run.ensureAppBoot();
    const d = deferred();
    liteQueue = [d.responder];
    const recovery = m.run.requestAppBootProfileRecovery();
    await flush();
    const { fetchMeProfileFullBackground } = await import("@/lib/profile/fetch-me-profile-deduped");
    let fullDone = false;
    const full = fetchMeProfileFullBackground("mypage_home").then((r) => {
      fullDone = true;
      return r;
    });
    await flush();
    expect(fullDone).toBe(false);
    expect(fullCalls).toBe(0);
    d.resolve(new Response(JSON.stringify({ ok: true, profile: PROFILE }), { status: 200 }));
    await recovery;
    const result = await full;
    expect(result.status).toBe(200);
    expect(liteCalls).toBe(2);
    expect(fullCalls).toBeLessThanOrEqual(1);
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
  });

  it("8) 늦게 온 이전 응답 vs 새 응답 → 이전 응답은 상태·캐시에 쓰지 않음, 새 실행 보존", async () => {
    liteQueue = [networkError()];
    const m = await load();
    await m.run.ensureAppBoot();
    const old = deferred();
    liteQueue = [old.responder];
    const oldRun = m.run.requestAppBootProfileRecovery();
    await flush();
    logout(m);
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    const fresh = deferred();
    liteQueue = [fresh.responder];
    const newRun = m.run.ensureAppBoot();
    await flush();
    expect(liteCalls).toBe(3);
    old.resolve(new Response(JSON.stringify({ ok: true, profile: PROFILE }), { status: 200 }));
    await oldRun;
    await flush();
    expect(m.store.peekAppBootProfile()).toBeNull();
    expect(m.liteCache.peekAppBootProfileFetchCached()).toBeNull();
    /** 이전 실행 종료가 새 실행의 in-flight 를 지우지 않는다 → 같은 Promise 합류, 추가 요청 없음 */
    expect(m.run.ensureAppBoot()).toBe(newRun);
    expect(liteCalls).toBe(3);
    const u2 = { ...PROFILE, id: "u2" } as ProfileRow;
    fresh.resolve(new Response(JSON.stringify({ ok: true, profile: u2 }), { status: 200 }));
    await newRun;
    expect(m.store.peekAppBootProfile()?.id).toBe("u2");
  });

  it("9) 복구 후 지역(PROFILE_UPDATED)·알림음·첫 뱃지·사장님 뱃지 초기화 실행", async () => {
    liteQueue = [networkError(), okProfile()];
    const m = await load();
    await m.run.ensureAppBoot();
    await flush();
    expect(armNotificationSoundSsotFirstLoad).not.toHaveBeenCalled();
    expect(ensureInitialBadgeSnapshotForBoot).not.toHaveBeenCalled();
    expect(enableOwnerHubBadgeBackgroundHydration).not.toHaveBeenCalled();
    expect(readyEvents).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    /** 백그라운드 초기화는 첫 페인트 이후 timer tick 에서 실행 */
    await vi.advanceTimersByTimeAsync(100);
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    expect(readyEvents).toBe(1);
    expect(profileUpdatedEvents).toBe(1);
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledTimes(1);
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledWith("app_boot");
    expect(ensureInitialBadgeSnapshotForBoot).toHaveBeenCalledTimes(1);
    expect(enableOwnerHubBadgeBackgroundHydration).toHaveBeenCalledTimes(1);
  });

  it("10) 실제 비회원 정상 시작 → anonymous·비회원 확정·복구 없음", async () => {
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue({ ok: false, status: 401 });
    liteDefault = status401();
    const m = await load();
    await m.run.ensureAppBoot();
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("anonymous");
    expect(m.guest.isTerminalGuestAuthEstablished()).toBe(true);
    expect(readyEvents).toBe(1);
    expect(armNotificationSoundSsotFirstLoad).not.toHaveBeenCalled();
    expect(enableOwnerHubBadgeBackgroundHydration).toHaveBeenCalledTimes(1);
    const calls = liteCalls;
    window.dispatchEvent(new Event("online"));
    await m.run.requestAppBootProfileRecovery();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(liteCalls).toBe(calls);
  });
});

describe("앱 시작 lite 프로필 — 추가 검증", () => {
  it("error 에서 ensureAppBoot 를 여러 소비처가 호출 → 새 요청 없음·시작 완료/비회원 아님", async () => {
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    const calls = liteCalls;
    await Promise.all([1, 2, 3, 4, 5, 6].map(() => m.run.ensureAppBoot()));
    expect(liteCalls).toBe(calls);
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    expect(m.store.isAppBootReady()).toBe(false);
    expect(m.store.peekAppBootProfile()).toBeNull();
    expect(readyEvents).toBe(0);
    expect(m.guest.isGuestAuthEstablished()).toBe(false);

    /** 매장 홈: 회원 규칙(root 1회) — 빈 화면 고착 아님, 비회원 분기 아님 */
    const { resolveStoresHomeFeedQueryGate } = await import("@/lib/stores/stores-home-feed-query-gate");
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "" });
    /** 거래 지역: error 는 비회원 전국(ALL) 확정 근거가 아님 (getCurrentUser 가 비어 있어도) */
    const { canCommitTradeGuestNationwideAllFromAddressDefaults } = await import(
      "@/lib/trade/location/trade-marketplace-address-defaults-hydrate-scope"
    );
    expect(
      canCommitTradeGuestNationwideAllFromAddressDefaults({ ok: false, status: 401 } as never),
    ).toBe(false);
  });

  it("online·visibility·화면 재진입이 동시에 발생 → 복구 요청 1건", async () => {
    liteQueue = [networkError()];
    const m = await load();
    await m.run.ensureAppBoot();
    const d = deferred();
    liteQueue = [d.responder];
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    const p1 = m.run.requestAppBootProfileRecovery();
    const p2 = m.run.requestAppBootProfileRecovery();
    await flush();
    expect(liteCalls).toBe(2);
    expect(p1).toBe(p2);
    d.resolve(new Response(JSON.stringify({ ok: true, profile: PROFILE }), { status: 200 }));
    await p1;
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledTimes(1);
  });

  it("자동 재시도 3회(1.5·3·6초) 소진 후 정지 → 명시 재시도 1회만", async () => {
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    expect(liteCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_499);
    expect(liteCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(liteCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(liteCalls).toBe(3);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(liteCalls).toBe(4);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(liteCalls).toBe(4);
    await m.run.requestAppBootProfileRecovery();
    expect(liteCalls).toBe(5);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(liteCalls).toBe(5);
    expect(m.store.getAppBootSnapshot().status).toBe("error");
  });

  it("로그아웃 중 복구 요청 완료 → 이전 계정 프로필 미반영·예약 취소", async () => {
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    const d = deferred();
    liteQueue = [d.responder];
    const run = m.run.requestAppBootProfileRecovery();
    await flush();
    logout(m);
    d.resolve(new Response(JSON.stringify({ ok: true, profile: PROFILE }), { status: 200 }));
    await run;
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("idle");
    expect(m.store.peekAppBootProfile()).toBeNull();
    expect(m.liteCache.peekAppBootProfileFetchCached()).toBeNull();
    expect(armNotificationSoundSsotFirstLoad).not.toHaveBeenCalled();
    const calls = liteCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(liteCalls).toBe(calls);
  });

  it("복구 성공 이벤트 중복(merge·ensure·online·visibility) → 초기화 1회·재시도 중지", async () => {
    liteQueue = [networkError(), okProfile()];
    const m = await load();
    await m.run.ensureAppBoot();
    await m.run.requestAppBootProfileRecovery();
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    m.store.mergeAppBootProfileFull({ ...PROFILE, nickname: "x" } as ProfileRow);
    m.store.mergeAppBootProfileFull({ ...PROFILE, nickname: "y" } as ProfileRow);
    await m.run.ensureAppBoot();
    await m.run.ensureAppBoot();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(liteCalls).toBe(2);
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledTimes(1);
    expect(ensureInitialBadgeSnapshotForBoot).toHaveBeenCalledTimes(1);
    expect(enableOwnerHubBadgeBackgroundHydration).toHaveBeenCalledTimes(1);
  });

  it("boot 실행 밖 error → ready(약관 동의 merge 등) → 상태 구독 경로로 초기화 1회", async () => {
    liteDefault = networkError();
    const m = await load();
    await m.run.ensureAppBoot();
    m.store.mergeAppBootProfileFull(PROFILE);
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    expect(readyEvents).toBe(1);
    expect(armNotificationSoundSsotFirstLoad).toHaveBeenCalledTimes(1);
    expect(ensureInitialBadgeSnapshotForBoot).toHaveBeenCalledTimes(1);
    const calls = liteCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(liteCalls).toBe(calls);
  });

  it("정상 로그인 사용자 일시 실패 → 자동 복구, 비회원·hydrating 깜빡임 없음", async () => {
    liteQueue = [networkError(), okProfile()];
    const m = await load();
    await m.run.ensureAppBoot();
    const afterFail = statuses.length;
    await vi.advanceTimersByTimeAsync(1_500);
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
    expect(statuses).not.toContain("anonymous");
    expect(statuses.slice(afterFail)).not.toContain("hydrating");
    expect(m.guest.isGuestAuthEstablished()).toBe(false);
    expect(setSupabaseProfileCache).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }));
  });

  it("복구 실패가 계속돼도 무한 대기 없음 → error 확정·매장 피드 열림", async () => {
    liteDefault = headerStall();
    const m = await load();
    void m.run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(12_000 + 1_500 + 12_000 + 3_000 + 12_000 + 6_000 + 12_000);
    await flush();
    expect(liteCalls).toBe(4);
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    let resolved = false;
    void m.run.ensureAppBoot().then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(true);
    const { resolveStoresHomeFeedQueryGate } = await import("@/lib/stores/stores-home-feed-query-gate");
    expect(resolveStoresHomeFeedQueryGate(null).ready).toBe(true);
  });

  it("401 → 세션 복구 성공 → lite 재조회 마감 초과 → 비회원 확정 금지(error)", async () => {
    liteQueue = [status401(), headerStall()];
    /** 401 캐시(4초)가 끝난 뒤 재조회가 네트워크로 나가는 경우 */
    recoverFrom401Once.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ recovered: true }), 5_000)),
    );
    const m = await load();
    void m.run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(5_000 + 12_000);
    await flush();
    expect(liteCalls).toBe(2);
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    expect(m.guest.isGuestAuthEstablished()).toBe(false);
    expect(markSessionTerminalGuestFromClient).not.toHaveBeenCalled();
  });

  it("getUser 비어 있음 → 세션 레지스트리 인증 → 복구 성공 → lite 마감 초과 → error, 이후 복구", async () => {
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue({ ok: true, status: 200 });
    const m = await load();
    runRecoverableGuestRecovery.mockImplementation(async () => {
      m.guest.clearGuestAuthState();
      return true;
    });
    liteQueue = [networkError(), headerStall()];
    void m.run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(12_000);
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("error");
    expect(m.guest.isTerminalGuestAuthEstablished()).toBe(false);
    expect(markSessionTerminalGuestFromClient).not.toHaveBeenCalled();
    dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    liteDefault = okProfile();
    await vi.advanceTimersByTimeAsync(1_500);
    await flush();
    expect(m.store.getAppBootSnapshot().status).toBe("ready");
  });
});
