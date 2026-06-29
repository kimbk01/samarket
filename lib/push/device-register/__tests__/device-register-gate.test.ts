import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  deviceRegisterIdentityKey,
  type DeviceRegisterIdentity,
} from "@/lib/push/device-register/device-register-identity";
import {
  evaluateDeviceRegisterGate,
  markDeviceRegisterSuccess,
  recordDeviceRegisterProceedAttempt,
  resetDeviceRegisterGateForTests,
} from "@/lib/push/device-register/device-register-gate";
import { registerDeviceOnce, resetDeviceRegisterGateForTests as resetOnce } from "@/lib/push/device-register/register-device-once";

const identity: DeviceRegisterIdentity = {
  userId: "user-abc-123",
  deviceId: "device-xyz-456",
  pushToken: "fcm-token-789012345678",
  platform: "android",
  pushProvider: "fcm",
};

describe("device-register SSOT gate", () => {
  beforeEach(() => {
    resetDeviceRegisterGateForTests();
    resetOnce();
  });

  it("dedupes same identity to one POST", async () => {
    const postFn = vi.fn(async () => ({ ok: true as const }));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => registerDeviceOnce(identity, "test", postFn)),
    );
    expect(postFn).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("joins inflight duplicate calls", async () => {
    let resolvePost: ((v: { ok: true }) => void) | undefined;
    const postFn = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolvePost = resolve;
        }),
    );
    const p1 = registerDeviceOnce(identity, "test", postFn);
    const p2 = registerDeviceOnce(identity, "test", postFn);
    expect(postFn).toHaveBeenCalledTimes(1);
    resolvePost?.({ ok: true });
    await expect(Promise.all([p1, p2])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });

  it("allows POST after token change", async () => {
    const postFn = vi.fn(async () => ({ ok: true as const }));
    await registerDeviceOnce(identity, "test", postFn);
    const changed = { ...identity, pushToken: "fcm-token-changed-999" };
    await registerDeviceOnce(changed, "test", postFn);
    expect(postFn).toHaveBeenCalledTimes(2);
    expect(deviceRegisterIdentityKey(identity)).not.toBe(deviceRegisterIdentityKey(changed));
  });

  it("allows POST after user change", async () => {
    const postFn = vi.fn(async () => ({ ok: true as const }));
    await registerDeviceOnce(identity, "test", postFn);
    const changed = { ...identity, userId: "user-other-999" };
    await registerDeviceOnce(changed, "test", postFn);
    expect(postFn).toHaveBeenCalledTimes(2);
  });

  it("skips repeat POST within success TTL", async () => {
    const postFn = vi.fn(async () => ({ ok: true as const }));
    await registerDeviceOnce(identity, "test", postFn);
    await registerDeviceOnce(identity, "test", postFn);
    expect(postFn).toHaveBeenCalledTimes(1);
  });

  it("applies failure backoff", async () => {
    vi.useFakeTimers();
    const postFn = vi.fn(async () => ({ ok: false as const, error: "register_failed" }));
    const first = await registerDeviceOnce(identity, "test", postFn);
    expect(first.ok).toBe(false);
    expect(postFn).toHaveBeenCalledTimes(1);
    const second = await registerDeviceOnce(identity, "test", postFn);
    expect(second).toEqual({ ok: false, error: "register_backoff" });
    expect(postFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_500);
    await registerDeviceOnce(identity, "test", postFn);
    expect(postFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("blocks burst loop guard", () => {
    for (let i = 0; i < 8; i += 1) {
      const gate = recordDeviceRegisterProceedAttempt(identity, "burst");
      expect(gate.action).toBe("proceed");
    }
    const blocked = recordDeviceRegisterProceedAttempt(identity, "burst");
    expect(blocked.action).toBe("loop_guard_blocked");
  });
});

describe("deviceRegisterIdentityKey", () => {
  it("is stable for same identity fields", () => {
    expect(deviceRegisterIdentityKey(identity)).toBe(deviceRegisterIdentityKey({ ...identity }));
  });
});

describe("evaluateDeviceRegisterGate skip", () => {
  beforeEach(() => {
    resetDeviceRegisterGateForTests();
  });

  it("returns skip_same_identity within TTL", () => {
    markDeviceRegisterSuccess(identity, "js_fetch");
    const gate = evaluateDeviceRegisterGate(identity, "foreground_check");
    expect(gate.action).toBe("skip_same_identity");
  });
});
