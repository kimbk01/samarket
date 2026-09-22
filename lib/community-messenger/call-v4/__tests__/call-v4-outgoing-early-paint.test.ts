import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

type CreateResult = {
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
};

const apiMocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => undefined),
  resolveRoom: vi.fn(async () => ({ ok: true as const, roomId: "room-1" })),
  createSession: vi.fn(async (): Promise<CreateResult> => ({
    ok: true,
    session: {
      id: "call-session-1",
      roomId: "room-1",
      sessionMode: "direct",
      initiatorUserId: "user-a",
      recipientUserId: "user-b",
      peerUserId: "user-b",
      peerLabel: "Peer",
      callKind: "voice",
      status: "ringing",
      startedAt: new Date().toISOString(),
      answeredAt: null,
      endedAt: null,
      isMineInitiator: true,
      participants: [],
    } as CommunityMessengerCallSession,
  })),
  patchCancel: vi.fn(async () => ({ ok: true })),
}));

const bridgeMocks = vi.hoisted(() => ({
  isAndroid: vi.fn(() => true),
  preparing: vi.fn(async (_input: unknown) => ({ ok: true })),
  finishPreparing: vi.fn(async (_attemptId: unknown) => undefined),
  bind: vi.fn(async (_input: unknown) => ({ ok: true, nativeOwned: true })),
  establish: vi.fn(async (_input: unknown) => ({ ok: false, nativeOwned: false })),
  owned: vi.fn(async (_callId: unknown) => false),
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isAndroidNativeOutgoingShell: () => bridgeMocks.isAndroid(),
  isIOSNativeOutgoingShell: vi.fn(async () => false),
  isIOSNativeVideoOutgoingShell: vi.fn(async () => false),
  startNativeOutgoingPreparing: (input: unknown) => bridgeMocks.preparing(input),
  finishNativeOutgoingPreparing: (attemptId: unknown) => bridgeMocks.finishPreparing(attemptId),
  bindNativeOutgoingEstablishment: (input: unknown) => bridgeMocks.bind(input),
  startNativeOutgoingEstablishment: (input: unknown) => bridgeMocks.establish(input),
  isNativeEstablishmentOwned: (callId: unknown) => bridgeMocks.owned(callId),
  NATIVE_OUTGOING_PREPARING_ABANDONED_EVENT: "nativeOutgoingPreparingAbandoned",
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  nativeCallServicePlugin: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    callV4ReconcileBeforeCreate: apiMocks.reconcile,
    callV4ResolveOutgoingRoomId: apiMocks.resolveRoom,
    callV4CreateSession: apiMocks.createSession,
    callV4PatchCancel: apiMocks.patchCancel,
  };
});

vi.mock("@/lib/community-messenger/call-v4/native-outgoing-terminal-sync", () => ({
  startNativeOutgoingTerminalSync: vi.fn(),
  stopNativeOutgoingTerminalSync: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-missed-timeout", () => ({
  clearCallV4MissedTimer: vi.fn(),
  startCallV4OutgoingMissedTimer: vi.fn(),
}));

import {
  abandonCallV4OutgoingAttempt,
  createCallV4OutgoingAttempt,
  isCallV4OutgoingAttemptBindable,
  readCallV4OutgoingAttempt,
  resetCallV4OutgoingAttemptForTests,
} from "@/lib/community-messenger/call-v4/call-v4-outgoing-attempt";
import { callV4CreateOutgoing } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { resetCallV4PatchClaimsForTests } from "@/lib/community-messenger/call-v4/call-v4-patch-guard";

function sessionFixture(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "user-a",
    recipientUserId: "user-b",
    peerUserId: "user-b",
    peerLabel: "Peer",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: true,
    participants: [],
  };
}

describe("call-v4-outgoing-attempt", () => {
  beforeEach(() => {
    resetCallV4OutgoingAttemptForTests();
  });

  it("ACTIVE attempt binds exactly once", () => {
    const a = createCallV4OutgoingAttempt({ mediaType: "audio" });
    expect(isCallV4OutgoingAttemptBindable(a.attemptId)).toBe(true);
    expect(abandonCallV4OutgoingAttempt(a.attemptId)).toBe(true);
    expect(isCallV4OutgoingAttemptBindable(a.attemptId)).toBe(false);
  });

  it("stale attempt A cannot mutate after B exists", () => {
    const a = createCallV4OutgoingAttempt({ mediaType: "audio" });
    const aId = a.attemptId;
    const b = createCallV4OutgoingAttempt({ mediaType: "video" });
    expect(isCallV4OutgoingAttemptBindable(aId)).toBe(false);
    expect(isCallV4OutgoingAttemptBindable(b.attemptId)).toBe(true);
    expect(readCallV4OutgoingAttempt()?.attemptId).toBe(b.attemptId);
  });
});

describe("call-v4 early-paint create gates", () => {
  beforeEach(() => {
    resetCallV4OutgoingAttemptForTests();
    resetCallV4PatchClaimsForTests();
    useCallV4Store.getState().resetToIdle();
    apiMocks.reconcile.mockClear();
    apiMocks.resolveRoom.mockClear();
    apiMocks.createSession.mockClear();
    apiMocks.patchCancel.mockClear();
    bridgeMocks.isAndroid.mockReturnValue(true);
    bridgeMocks.preparing.mockClear();
    bridgeMocks.preparing.mockResolvedValue({ ok: true });
    bridgeMocks.finishPreparing.mockClear();
    bridgeMocks.bind.mockClear();
    bridgeMocks.bind.mockResolvedValue({ ok: true, nativeOwned: true });
    bridgeMocks.establish.mockClear();
    apiMocks.createSession.mockResolvedValue({
      ok: true,
      session: sessionFixture("call-session-1"),
    });
  });

  it("ACTIVE + create success → exactly one BIND", async () => {
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      peerLabel: "Peer",
      router: { push: vi.fn(), replace: vi.fn() },
    });
    expect(result.ok).toBe(true);
    expect(bridgeMocks.preparing).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.bind).toHaveBeenCalledTimes(1);
    const bindArg = bridgeMocks.bind.mock.calls[0]?.[0] as { callId?: string };
    expect(bindArg).toMatchObject({ callId: "call-session-1" });
    expect(apiMocks.patchCancel).not.toHaveBeenCalled();
  });

  it("ABANDONED + late create success → zero BIND + canonical cancel", async () => {
    let resolveCreate!: (v: CreateResult) => void;
    apiMocks.createSession.mockImplementation(
      () =>
        new Promise<CreateResult>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const pending = callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace: vi.fn() },
    });

    await vi.waitFor(() => expect(bridgeMocks.preparing).toHaveBeenCalled());
    await vi.waitFor(() => expect(apiMocks.createSession).toHaveBeenCalled());

    const attempt = readCallV4OutgoingAttempt();
    expect(attempt?.state).toBe("ACTIVE");
    abandonCallV4OutgoingAttempt(attempt!.attemptId);
    expect(isCallV4OutgoingAttemptBindable(attempt!.attemptId)).toBe(false);

    resolveCreate({ ok: true, session: sessionFixture("call-late-1") });
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(bridgeMocks.bind).not.toHaveBeenCalled();
    expect(apiMocks.patchCancel).toHaveBeenCalledWith("call-late-1");
  });

  it("ABANDONED + create failure → zero BIND + no cancel on missing session", async () => {
    let resolveCreate!: (v: CreateResult) => void;
    apiMocks.createSession.mockImplementation(
      () =>
        new Promise<CreateResult>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const pending = callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace: vi.fn() },
    });
    await vi.waitFor(() => expect(apiMocks.createSession).toHaveBeenCalled());
    const attempt = readCallV4OutgoingAttempt();
    abandonCallV4OutgoingAttempt(attempt!.attemptId);

    resolveCreate({ ok: false, error: "call_failed" });
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(bridgeMocks.bind).not.toHaveBeenCalled();
    expect(apiMocks.patchCancel).not.toHaveBeenCalled();
  });

  it("PREPARING handoff runs before create_session", async () => {
    const order: string[] = [];
    bridgeMocks.preparing.mockImplementation(async () => {
      order.push("preparing");
      return { ok: true };
    });
    apiMocks.reconcile.mockImplementation(async () => {
      order.push("reconcile");
    });
    apiMocks.createSession.mockImplementation(async () => {
      order.push("create");
      return { ok: true, session: sessionFixture("call-order-1") };
    });
    bridgeMocks.bind.mockImplementation(async () => {
      order.push("bind");
      return { ok: true, nativeOwned: true };
    });

    await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace: vi.fn() },
    });

    expect(order.indexOf("preparing")).toBeLessThan(order.indexOf("reconcile"));
    expect(order.indexOf("reconcile")).toBeLessThan(order.indexOf("create"));
    expect(order.indexOf("create")).toBeLessThan(order.indexOf("bind"));
  });

  it("non-Android keeps web route without preparing", async () => {
    bridgeMocks.isAndroid.mockReturnValue(false);
    const replace = vi.fn();
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace },
    });
    expect(result.ok).toBe(true);
    expect(bridgeMocks.preparing).not.toHaveBeenCalled();
    expect(bridgeMocks.bind).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });

  it("duplicate create protection: ACTIVE shares in-flight promise", async () => {
    let resolveCreate!: (v: CreateResult) => void;
    apiMocks.createSession.mockImplementation(
      () =>
        new Promise<CreateResult>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const a = callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace: vi.fn() },
    });
    await vi.waitFor(() => expect(apiMocks.createSession).toHaveBeenCalledTimes(1));
    const b = callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace: vi.fn() },
    });
    resolveCreate({ ok: true, session: sessionFixture("call-dup-1") });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(apiMocks.createSession).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.bind).toHaveBeenCalledTimes(1);
  });
});
