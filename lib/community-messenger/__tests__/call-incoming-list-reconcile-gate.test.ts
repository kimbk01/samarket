import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INCOMING_LIST_RECONCILE_MIN_INTERVAL_MS,
  markIncomingListReconcileSuccess,
  resetIncomingListReconcileGateForTests,
  runIncomingListReconcileIfDue,
  shouldRunIncomingListReconcile,
} from "@/lib/community-messenger/call-incoming-list-reconcile-gate";

const UID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  resetIncomingListReconcileGateForTests();
});

describe("incoming list reconcile gate (Phase A1)", () => {
  it("N초 안에는 두 번째 실행을 건너뛴다", async () => {
    const run = vi.fn(async () => undefined);
    expect(await runIncomingListReconcileIfDue(UID, run)).toEqual({ ran: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await runIncomingListReconcileIfDue(UID, run)).toEqual({ ran: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("force 이면 간격과 무관하게 실행한다", async () => {
    const run = vi.fn(async () => undefined);
    await runIncomingListReconcileIfDue(UID, run);
    expect(await runIncomingListReconcileIfDue(UID, run, { force: true })).toEqual({ ran: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("N초가 지나면 다시 실행한다", async () => {
    const now = 1_000_000;
    markIncomingListReconcileSuccess(UID, now);
    expect(shouldRunIncomingListReconcile(UID, now + INCOMING_LIST_RECONCILE_MIN_INTERVAL_MS - 1)).toBe(
      false,
    );
    expect(shouldRunIncomingListReconcile(UID, now + INCOMING_LIST_RECONCILE_MIN_INTERVAL_MS)).toBe(true);
  });

  it("동시 호출은 single-flight 로 1회만 실행한다", async () => {
    let resolveRun!: () => void;
    const started = new Promise<void>((r) => {
      resolveRun = r;
    });
    const run = vi.fn(async () => {
      await started;
    });
    const a = runIncomingListReconcileIfDue(UID, run);
    const b = runIncomingListReconcileIfDue(UID, run);
    resolveRun();
    await Promise.all([a, b]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("실패하면 시각을 기록하지 않아 곧 재시도한다", async () => {
    const fail = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(runIncomingListReconcileIfDue(UID, fail)).rejects.toThrow("boom");
    const ok = vi.fn(async () => undefined);
    expect(await runIncomingListReconcileIfDue(UID, ok)).toEqual({ ran: true });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
