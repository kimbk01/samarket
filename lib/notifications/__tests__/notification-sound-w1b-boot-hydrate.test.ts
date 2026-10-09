/** @vitest-environment jsdom */
/**
 * W1-b (Owner directive 2026-10-06): cold start that stays on home must play the admin receive sound.
 *
 * Root cause (before): the only general client hydrate trigger was route-gated `NotificationSoundPrime`
 * (`mountNotificationSoundPrime` excludes `/` and `/philife`), so a home-only session never hydrated and
 * the resolver served the static registry default (`/sounds/notification.wav`).
 *
 * Fix: authenticated App Boot completion (`scheduleAppBootBackgroundHydration`, route-independent) owns the
 * first load; before the first load the canonical receive path joins the in-flight load or skips
 * (`ssot_not_ready`) — it never plays the registry default as the configured sound.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/http/startup-api-scheduler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/startup-api-scheduler")>();
  return { ...actual, scheduleStartupApiDeferred: vi.fn(() => () => {}) };
});

vi.mock("@/lib/push/native/member-call-eligibility-bridge", () => ({
  projectNativeMemberEventEligibility: vi.fn(),
}));

import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { scheduleAppBootBackgroundHydration } from "@/lib/app-boot/schedule-app-boot-background";
import { resetAppBootStore, setAppBootAnonymous, setAppBootProfile } from "@/lib/app-boot/app-boot-store";
import type { ProfileRow } from "@/lib/profile/types";
import {
  __resetNotificationSoundDecisionForTests,
  ingestMessengerMessageSound,
  resetNotificationSoundRuntimeForAuthEpoch,
} from "@/lib/notifications/notification-sound-decision";
import {
  ensureNotificationSoundSsotHydratedForClient,
  isNotificationSoundSsotClientReady,
  resetNotificationSoundSsotClientHydrateForTests,
} from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import {
  getNotificationSoundSsotSnapshotOrigin,
  invalidateNotificationSoundSsotCache,
  resetNotificationSoundSsotSnapshotForTests,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";
import { invalidateChatRoomEntryInAppSound } from "@/lib/notifications/chat-room-entry-sound";
import { NOTIFICATION_SOUND_SSOT_READY_WAIT_MS } from "@/lib/notifications/notification-sound-engine";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { NOTIFICATION_SOUND_SSOT_FIRST_LOAD_RETRY_DELAYS_MS } from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import {
  markSessionAuthenticatedFromClient,
  markSessionTerminalGuestFromClient,
} from "@/lib/auth/dibay-session-manager";
import { NotificationSoundLeaderBootstrap } from "@/components/notifications/NotificationSoundLeaderBootstrap";

const EVENT = "messenger_direct_message_received";
const API = "/api/app/notification-sound-ssot";
const ADMIN_A = { id: "DIBAY-CUSTOM-SND-A", url: "https://cdn.example.com/admin-a.mp3" };
const ADMIN_B = { id: "DIBAY-CUSTOM-SND-B", url: "https://cdn.example.com/admin-b.mp3" };
const SEC = 1_000;
const MIN = 60 * SEC;

function body(a: { id: string; url: string }) {
  return {
    ok: true,
    assets: [
      {
        id: a.id,
        label: `${a.id}.mp3`,
        kind: "dibay_custom",
        domain: "messenger_direct",
        file_url: a.url,
        file_path: null,
        ios_sound_name: null,
        android_channel_base: null,
        legacy_source: null,
        enabled: true,
      },
    ],
    events: [],
    mappings: [
      {
        event_key: EVENT,
        asset_id: a.id,
        use_device_default: false,
        volume: 0.7,
        repeat_count: 1,
        cooldown_seconds: 0,
        vibration_enabled: null,
        priority: null,
        enabled: true,
      },
    ],
  };
}

type Reply = { status: number; body?: unknown } | Error;

/** fetch stub: only the SSOT endpoint is expected; each call takes the next scripted/deferred reply. */
function installFetch() {
  const calls: string[] = [];
  const queue: Array<Reply | Promise<Reply>> = [];
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const next = queue.shift() ?? { status: 500 };
    return Promise.resolve(next).then((r) => {
      if (r instanceof Error) throw r;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} };
    });
  });
  vi.stubGlobal("fetch", fn);
  return {
    calls,
    ssotCalls: () => calls.filter((u) => u.includes(API)).length,
    reply: (r: Reply) => queue.push(r),
    deferred: () => {
      let resolve!: (r: Reply) => void;
      queue.push(new Promise<Reply>((res) => (resolve = res)));
      return (r: Reply) => resolve(r);
    },
  };
}

const played: string[] = [];
class FakeAudio {
  volume = 1;
  muted = false;
  currentTime = 0;
  constructor(public src: string) {
    played.push(src);
  }
  play() {
    return Promise.resolve();
  }
}

async function flush(n = 8) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function profile(id: string): ProfileRow {
  return { id } as unknown as ProfileRow;
}

let msgSeq = 0;
function receive(recipientId = "user-1") {
  msgSeq += 1;
  return ingestMessengerMessageSound({ messageId: `msg-${msgSeq}`, recipientId, createdAt: null });
}

function resetDecision(recipientId = "user-1") {
  __resetNotificationSoundDecisionForTests({
    recipientId,
    isLeader: true,
    callActive: false,
    visibility: "visible",
    windowFocused: true,
    ssotReady: null, // real readiness — the W1-b gate under test
  });
}

let registryUrl: string | null = null;

beforeEach(() => {
  played.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("requestAnimationFrame", vi.fn()); // keep other boot background jobs out of scope
  resetNotificationSoundSsotSnapshotForTests();
  resetNotificationSoundSsotClientHydrateForTests();
  forgetSingleFlight("app:notification-sound-ssot:hydrate");
  resetAppBootStore();
  window.history.replaceState({}, "", "/");
  registryUrl = resolveNotificationSound(EVENT, { platform: "web" }).webUrl;
  resetDecision();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetNotificationSoundSsotSnapshotForTests();
  resetNotificationSoundSsotClientHydrateForTests();
  forgetSingleFlight("app:notification-sound-ssot:hydrate");
  resetAppBootStore();
});

describe("W1-b root cause evidence (route gating)", () => {
  it("Prime is not mounted on home routes, mounted on 내정보 / messenger", () => {
    expect(resolveConditionalAppShellFlags("/", false).mountNotificationSoundPrime).toBe(false);
    expect(resolveConditionalAppShellFlags("/philife", false).mountNotificationSoundPrime).toBe(false);
    expect(resolveConditionalAppShellFlags("/mypage", false).mountNotificationSoundPrime).toBe(true);
    expect(resolveConditionalAppShellFlags("/community-messenger", false).mountNotificationSoundPrime).toBe(true);
  });

  it("registry default differs from the admin asset (what home played before)", () => {
    expect(registryUrl).toBeTruthy();
    expect(registryUrl).not.toBe(ADMIN_A.url);
    expect(getNotificationSoundSsotSnapshotOrigin()).toBe("registry");
  });
});

describe("W1-b cold start → authenticated boot hydrates on every route (no navigation)", () => {
  it.each(["/", "/philife", "/mypage", "/community-messenger"])(
    "cold start on %s: one SSOT request, receive plays the admin asset",
    async (path) => {
      window.history.replaceState({}, "", path);
      const f = installFetch();
      f.reply({ status: 200, body: body(ADMIN_A) });
      setAppBootProfile(profile("user-1"));
      scheduleAppBootBackgroundHydration();
      await flush();
      expect(f.ssotCalls()).toBe(1);
      expect(isNotificationSoundSsotClientReady()).toBe(true);

      expect(receive().action).toBe("PLAY");
      await flush();
      expect(played).toEqual([ADMIN_A.url]);
      expect(played).not.toContain(registryUrl);
    }
  );

  it("guest boot does not call the auth-only API (no 401 / backoff)", async () => {
    const f = installFetch();
    setAppBootAnonymous();
    scheduleAppBootBackgroundHydration();
    await flush();
    expect(f.ssotCalls()).toBe(0);
  });
});

describe("W1-b duplicate mounts / requests", () => {
  it("boot + Prime mount + first gesture + repeated boot arm share one request", async () => {
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    void ensureNotificationSoundSsotHydratedForClient(); // Prime mount (내정보/messenger)
    void ensureNotificationSoundSsotHydratedForClient(); // first gesture
    scheduleAppBootBackgroundHydration(); // re-arm while in flight
    release({ status: 200, body: body(ADMIN_A) });
    await flush();
    expect(f.ssotCalls()).toBe(1);
    // inside TTL: later boot arm / Prime remount do not refetch
    scheduleAppBootBackgroundHydration();
    await ensureNotificationSoundSsotHydratedForClient();
    expect(f.ssotCalls()).toBe(1);
  });
});

describe("W1-b pre-first-load state (slow network / failure)", () => {
  it("message during a slow first load waits for it and plays the admin asset, never the registry default", async () => {
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    expect(receive().action).toBe("PLAY");
    await flush();
    expect(played).toEqual([]);
    release({ status: 200, body: body(ADMIN_A) });
    await flush(16);
    expect(played).toEqual([ADMIN_A.url]);
    expect(f.ssotCalls()).toBe(1);
  });

  it("first load slower than the wait bound: skip (no registry default), later messages play admin", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    receive();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    expect(played).toEqual([]);
    release({ status: 200, body: body(ADMIN_A) });
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([]); // the timed-out one is not replayed late
    resetDecision();
    receive();
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);
  });

  it.each([
    ["HTTP 500", { status: 500 } as Reply],
    ["HTTP 401", { status: 401 } as Reply],
    ["network error", new TypeError("network down") as Reply],
    ["ok:false body", { status: 200, body: { ok: false } } as Reply],
  ])("initial load failure (%s): that message is silent, registry default never played", async (_l, reply) => {
    vi.useFakeTimers();
    const f = installFetch();
    f.reply(reply);
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    expect(isNotificationSoundSsotClientReady()).toBe(false);
    receive();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    expect(played).toEqual([]);
    expect(f.ssotCalls()).toBe(1); // sound path starts no request (SOUND HOT PATH HTTP = 0)
  });

  it("never hydrated and nothing loading: skip after the wait bound, no request from the sound path", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    receive();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    expect(played).toEqual([]);
    expect(f.ssotCalls()).toBe(0);
  });

  it("room entry during the wait cancels the pending receive sound", async () => {
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    receive();
    await flush();
    invalidateChatRoomEntryInAppSound();
    release({ status: 200, body: body(ADMIN_A) });
    await flush(16);
    expect(played).toEqual([]);
  });
});

describe("W1-b login / logout / account switch", () => {
  it("anonymous 401 backoff does not block the first load after login", async () => {
    const f = installFetch();
    f.reply({ status: 401 });
    await ensureNotificationSoundSsotHydratedForClient(); // guest on a Prime route → 401 → 30 s backoff
    expect(f.ssotCalls()).toBe(1);
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1")); // login → App Boot completes authenticated
    scheduleAppBootBackgroundHydration();
    await flush();
    expect(f.ssotCalls()).toBe(2);
    expect(isNotificationSoundSsotClientReady()).toBe(true);
  });

  it("logout keeps the global last-good snapshot; guest boot sends nothing", async () => {
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await flush();
    resetNotificationSoundRuntimeForAuthEpoch(); // client-session-wipe (logout)
    resetAppBootStore();
    setAppBootAnonymous();
    scheduleAppBootBackgroundHydration();
    await flush();
    expect(f.ssotCalls()).toBe(1);
    expect(getNotificationSoundSsotSnapshotOrigin()).toBe("hydrated");
  });

  it("account switch: snapshot is global (no refetch inside TTL); after TTL the new boot picks up admin changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);

    resetNotificationSoundRuntimeForAuthEpoch(); // wipe (account_switched)
    resetAppBootStore();
    setAppBootProfile(profile("user-2"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.ssotCalls()).toBe(1);
    resetDecision("user-2");
    receive("user-2");
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);

    vi.setSystemTime(new Date("2026-10-06T00:01:05Z"));
    f.reply({ status: 200, body: body(ADMIN_B) });
    resetNotificationSoundRuntimeForAuthEpoch();
    resetAppBootStore();
    setAppBootProfile(profile("user-3"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.ssotCalls()).toBe(2);
    resetDecision("user-3");
    receive("user-3");
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url, ADMIN_B.url]);
  });

  it("auth wipe during the pre-first-load wait cancels the pending sound of the previous account", async () => {
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    receive();
    await flush();
    resetNotificationSoundRuntimeForAuthEpoch();
    release({ status: 200, body: body(ADMIN_A) });
    await flush(16);
    expect(played).toEqual([]);
  });
});

describe("W1-b refresh keeps last-good + W1 time regression", () => {
  it("admin-change invalidate + failed refresh on the next boot keeps the admin asset", async () => {
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await flush();
    invalidateNotificationSoundSsotCache();
    f.reply({ status: 500 });
    scheduleAppBootBackgroundHydration();
    await flush();
    expect(f.ssotCalls()).toBe(2);
    receive();
    await flush();
    expect(played).toEqual([ADMIN_A.url]);
  });

  it.each([
    ["61s", 61 * SEC],
    ["5m", 5 * MIN],
    ["30m", 30 * MIN],
    ["2h", 120 * MIN],
  ])("boot-hydrated home session still plays the admin asset after %s with no refetch", async (_l, elapsed) => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-06T00:00:00Z").getTime();
    vi.setSystemTime(t0);
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    vi.setSystemTime(t0 + elapsed);
    resetDecision();
    receive();
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);
    expect(f.ssotCalls()).toBe(1);
  });
});

describe("W1-b final A — first load failure on home is retried (bounded), not permanent silence", () => {
  // fallback only so the same file also runs (and fails per case) against the pre-fix base
  const [R1, R2, R3] = NOTIFICATION_SOUND_SSOT_FIRST_LOAD_RETRY_DELAYS_MS ?? [5_000, 15_000, 45_000];

  it("fail → stay on home → retry succeeds → next message plays the admin asset", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.reply({ status: 500 });
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.ssotCalls()).toBe(1);
    receive();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    expect(played).toEqual([]);
    await vi.advanceTimersByTimeAsync(R1);
    expect(f.ssotCalls()).toBe(2);
    expect(isNotificationSoundSsotClientReady()).toBe(true);
    resetDecision();
    receive();
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);
  });

  it("message waiting when the retry lands inside the 3 s bound plays the admin asset", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.reply({ status: 500 });
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(R1 - 1_000); // 1 s before the first retry
    receive();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(played).toEqual([ADMIN_A.url]);
  });

  it("retries are bounded: all fail → exactly 1 + 3 requests, then none (10 min later still 4)", async () => {
    vi.useFakeTimers();
    const f = installFetch(); // every reply defaults to 500
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(R1);
    await vi.advanceTimersByTimeAsync(R2);
    await vi.advanceTimersByTimeAsync(R3);
    expect(f.ssotCalls()).toBe(4);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(f.ssotCalls()).toBe(4);
    receive();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    expect(played).toEqual([]); // never the registry default
  });

  it("logout (auth epoch wipe) stops the retry chain", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.ssotCalls()).toBe(1);
    resetNotificationSoundRuntimeForAuthEpoch();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(f.ssotCalls()).toBe(1);
  });

  it("retry and a concurrent Prime mount share one request", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.reply({ status: 500 });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    const release = f.deferred();
    await vi.advanceTimersByTimeAsync(R1); // retry starts, held open
    void ensureNotificationSoundSsotHydratedForClient(); // Prime mount while retry in flight
    release({ status: 200, body: body(ADMIN_A) });
    await vi.advanceTimersByTimeAsync(1);
    expect(f.ssotCalls()).toBe(2);
    expect(isNotificationSoundSsotClientReady()).toBe(true);
  });

  it("with last-good present a failed refresh keeps it and starts no retry chain", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    vi.setSystemTime(new Date("2026-10-06T00:02:00Z"));
    f.reply({ status: 500 });
    scheduleAppBootBackgroundHydration(); // e.g. re-boot after TTL
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(f.ssotCalls()).toBe(2);
    resetDecision();
    receive();
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);
  });
});

describe("W1-b final B — 3 s bound: not replayed late, load completes independently", () => {
  it("first load fails, message times out, retry succeeds → only the next message plays", async () => {
    vi.useFakeTimers();
    const f = installFetch();
    f.reply({ status: 500 });
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    await vi.advanceTimersByTimeAsync(1);
    receive(); // waits 3 s, nothing applied
    await vi.advanceTimersByTimeAsync(NOTIFICATION_SOUND_SSOT_READY_WAIT_MS + 10);
    await vi.advanceTimersByTimeAsync(5_000); // first retry delay
    expect(isNotificationSoundSsotClientReady()).toBe(true);
    expect(played).toEqual([]); // timed-out message is not replayed
    resetDecision();
    receive();
    await vi.advanceTimersByTimeAsync(1);
    expect(played).toEqual([ADMIN_A.url]);
  });
});

describe("W1-b final C — login ordering races", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  async function mountBootstrap() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(NotificationSoundLeaderBootstrap));
    });
  }

  beforeEach(() => {
    markSessionTerminalGuestFromClient("w1b_test_reset");
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    host?.remove();
    host = null;
  });

  it("login that does not re-run App Boot (boot already anonymous): session authenticated starts the load; waiting message plays admin", async () => {
    await mountBootstrap();
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    setAppBootAnonymous();
    scheduleAppBootBackgroundHydration(); // guest boot: no request
    await flush();
    expect(f.ssotCalls()).toBe(0);
    receive(); // message arrives right around login
    await flush();
    markSessionAuthenticatedFromClient("prime_supabase"); // login primes session; App Boot stays `anonymous`
    await flush(16);
    expect(f.ssotCalls()).toBe(1);
    expect(played).toEqual([ADMIN_A.url]);
  });

  it("message before the login's App Boot completes waits for the load that starts afterwards", async () => {
    const f = installFetch();
    f.reply({ status: 200, body: body(ADMIN_A) });
    receive(); // nothing loading yet (boot still resolving the profile)
    await flush();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration(); // boot completes → first load starts
    await flush(16);
    expect(played).toEqual([ADMIN_A.url]);
  });

  it("session authenticated + App Boot completion at the same time send one request", async () => {
    await mountBootstrap();
    const f = installFetch();
    const release = f.deferred();
    markSessionAuthenticatedFromClient("prime_supabase");
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    release({ status: 200, body: body(ADMIN_A) });
    await flush(16);
    expect(f.ssotCalls()).toBe(1);
  });

  it("account switch race: previous account's waiting sound is cancelled; new account's message plays", async () => {
    const f = installFetch();
    const release = f.deferred();
    setAppBootProfile(profile("user-1"));
    scheduleAppBootBackgroundHydration();
    receive("user-1"); // waiting on account 1's load
    await flush();
    resetNotificationSoundRuntimeForAuthEpoch(); // account_switched wipe
    resetAppBootStore();
    release({ status: 200, body: body(ADMIN_A) }); // account 1's in-flight load lands after the wipe
    await flush(16);
    expect(played).toEqual([]);
    setAppBootProfile(profile("user-2"));
    scheduleAppBootBackgroundHydration();
    resetDecision("user-2");
    receive("user-2");
    await flush(16);
    expect(played).toEqual([ADMIN_A.url]);
  });
});
