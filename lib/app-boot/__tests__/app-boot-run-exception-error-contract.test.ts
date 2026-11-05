/** @vitest-environment jsdom */
/**
 * H2 — 인증 확인 중 예외(getUser 실패 + lite 네트워크 실패 + /api/auth/session 네트워크 2회 실패로 throw)
 * 에서 boot 가 `hydrating` 에 고착되지 않고 기존 `error` 계약으로 내려가 복구된다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeSupabaseAuthGetUser = vi.fn();
const fetchAuthSessionNoStore = vi.fn();

vi.mock("@/lib/auth/dedupe-supabase-get-user-client", () => ({
  dedupeSupabaseAuthGetUser: (...a: unknown[]) => dedupeSupabaseAuthGetUser(...a),
}));
vi.mock("@/lib/auth/api-auth-recovery", () => ({ recoverFrom401Once: vi.fn() }));
vi.mock("@/lib/auth/guest-auth-recovery", () => ({ runRecoverableGuestRecovery: vi.fn(() => Promise.resolve(false)) }));
vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...a: unknown[]) => fetchAuthSessionNoStore(...a),
}));
vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: () => Promise.resolve(),
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  markSessionTerminalGuestFromClient: vi.fn(),
  markSessionRecoveringFromClient: vi.fn(),
}));
vi.mock("@/lib/auth/guest-auth-boot-markers", () => ({ logGuestAuthBootMarker: () => {} }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: {} }) }));
vi.mock("@/lib/auth/supabase-profile-cache", () => ({
  setSupabaseProfileCache: vi.fn(),
  userToProfile: (u: { id: string }) => ({ id: u.id }),
}));
vi.mock("@/lib/auth/test-auth-store", () => ({ dispatchTestAuthChanged: () => {} }));
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => null }));
vi.mock("@/hooks/use-client-membership-state", () => ({ primeMembershipOnBoot: () => Promise.resolve() }));
vi.mock("@/lib/startup/startup-metrics", () => ({ markBootMetricsApiDone: () => {} }));
vi.mock("@/lib/app-boot/client-boot-request-journal", () => ({ recordBootVerifyFetch: () => {} }));
vi.mock("@/lib/dibay/shell-fetch-trace", () => ({ logShellFetchTrace: () => {} }));
vi.mock("@/lib/http/startup-api-scheduler", () => ({
  logStartupApiPlan: () => {},
  scheduleStartupApiDeferred: (_k: string, run: () => void) => {
    run();
    return () => {};
  },
}));
vi.mock("@/lib/notifications/notification-sound-ssot-client-hydrate", () => ({ armNotificationSoundSsotFirstLoad: vi.fn() }));
vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  ensureInitialBadgeSnapshotForBoot: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/notifications/member-badge-surface-authority", () => ({ isMemberBadgeAuthoritySurface: () => true }));
vi.mock("@/lib/chats/owner-hub-badge-store", () => ({ enableOwnerHubBadgeBackgroundHydration: vi.fn() }));
vi.mock("@/lib/business/owner-hub-path", () => ({ isStoreOwnerHubPathname: () => false }));

let readyEvents = 0;
const onReady = () => {
  readyEvents += 1;
};

function networkDown(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: new Error("network") });
  fetchAuthSessionNoStore.mockRejectedValue(new TypeError("Failed to fetch"));
}

function networkUpSignedIn(): void {
  dedupeSupabaseAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, profile: { id: "u1" } }), { status: 200 }))),
  );
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("requestIdleCallback", undefined);
  dedupeSupabaseAuthGetUser.mockReset();
  fetchAuthSessionNoStore.mockReset();
  networkDown();
  readyEvents = 0;
  const { APP_BOOT_READY_EVENT } = await import("@/lib/app-boot/app-boot-types");
  window.addEventListener(APP_BOOT_READY_EVENT, onReady);
});

afterEach(async () => {
  const { APP_BOOT_READY_EVENT } = await import("@/lib/app-boot/app-boot-types");
  window.removeEventListener(APP_BOOT_READY_EVENT, onReady);
  /** resetModules 뒤에도 이전 모듈 인스턴스의 online 리스너가 남는다 — error 를 벗어나게 해 다음 테스트에 개입하지 않게 한다. */
  const run = await import("@/lib/app-boot/run-app-boot");
  const store = await import("@/lib/app-boot/app-boot-store");
  run.invalidateAppBootFlight();
  store.setAppBootAnonymous();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("H2 — boot 실행 예외는 error 계약으로 종료", () => {
  it("ensureAppBoot 는 reject 하지 않고 status=error (비회원 추정·READY 없음)", async () => {
    const run = await import("@/lib/app-boot/run-app-boot");
    const store = await import("@/lib/app-boot/app-boot-store");
    let rejected: unknown = null;
    await run.ensureAppBoot().catch((e) => {
      rejected = e;
    });
    expect(rejected).toBeNull();
    expect(store.getAppBootSnapshot().status).toBe("error");
    expect(store.getAppBootSnapshot().error).toBe("boot_run_failed");
    expect(readyEvents).toBe(0);
  });

  it("자동 재시도는 기존 정책(최대 3회)으로 제한된다", async () => {
    const run = await import("@/lib/app-boot/run-app-boot");
    const store = await import("@/lib/app-boot/app-boot-store");
    await run.ensureAppBoot();
    expect(fetchAuthSessionNoStore).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchAuthSessionNoStore).toHaveBeenCalledTimes(1 + run.APP_BOOT_PROFILE_RECOVERY_DELAYS_MS.length);
    expect(store.getAppBootSnapshot().status).toBe("error");
  });

  it("네트워크 복구(online) 시 다시 실행되어 ready, READY 이벤트는 1회", async () => {
    const run = await import("@/lib/app-boot/run-app-boot");
    const store = await import("@/lib/app-boot/app-boot-store");
    await run.ensureAppBoot();
    networkUpSignedIn();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getAppBootSnapshot().status).toBe("ready");
    expect(readyEvents).toBe(1);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readyEvents).toBe(1);
  });

  it("명시 재시도(requestAppBootProfileRecovery)도 같은 경로로 복구된다", async () => {
    const run = await import("@/lib/app-boot/run-app-boot");
    const store = await import("@/lib/app-boot/app-boot-store");
    await run.ensureAppBoot();
    networkUpSignedIn();
    await run.requestAppBootProfileRecovery();
    expect(store.getAppBootSnapshot().status).toBe("ready");
  });

  it("로그아웃·계정 전환(epoch 무효화) 뒤 이전 실행의 예외 결과는 버린다", async () => {
    const run = await import("@/lib/app-boot/run-app-boot");
    const store = await import("@/lib/app-boot/app-boot-store");
    let failSession: (e: unknown) => void = () => {};
    fetchAuthSessionNoStore.mockReturnValueOnce(new Promise((_, reject) => (failSession = reject)));
    const p = run.ensureAppBoot();
    await vi.advanceTimersByTimeAsync(0);
    run.invalidateAppBootFlight();
    store.setAppBootAnonymous();
    failSession(new TypeError("Failed to fetch"));
    await p;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getAppBootSnapshot().status).toBe("anonymous");
    expect(fetchAuthSessionNoStore).toHaveBeenCalledTimes(1);
  });
});
