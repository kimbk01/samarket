import { beforeEach, describe, expect, it, vi } from "vitest";

const runCallEndGuard = vi.fn();

vi.mock("@/lib/call/actions/call-end-guard", () => ({
  runCallEndGuard: (...args: unknown[]) => runCallEndGuard(...args),
}));

describe("patchCommunityMessengerCallMissedOnce", () => {
  beforeEach(() => {
    vi.resetModules();
    runCallEndGuard.mockReset();
  });

  it("single-flights concurrent missed PATCH for the same session", async () => {
    let resolvePatch!: (value: { ok: boolean }) => void;
    const pending = new Promise<{ ok: boolean }>((resolve) => {
      resolvePatch = resolve;
    });
    runCallEndGuard.mockReturnValue(pending);

    const { patchCommunityMessengerCallMissedOnce } = await import(
      "@/lib/community-messenger/messenger-call-missed-patch"
    );

    const first = patchCommunityMessengerCallMissedOnce("session-1");
    const second = patchCommunityMessengerCallMissedOnce("session-1");

    expect(runCallEndGuard).toHaveBeenCalledTimes(1);
    expect(runCallEndGuard).toHaveBeenCalledWith({
      sessionId: "session-1",
      action: "missed",
      reason: "missed",
    });

    resolvePatch({ ok: true });
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.ok).toBe(true);
    expect(r2.skipped).toBe(true);
  });

  it("skips duplicate missed PATCH after success tombstone", async () => {
    runCallEndGuard.mockResolvedValue({ ok: true, session: { id: "session-2" } });

    const { patchCommunityMessengerCallMissedOnce } = await import(
      "@/lib/community-messenger/messenger-call-missed-patch"
    );

    const first = await patchCommunityMessengerCallMissedOnce("session-2");
    const second = await patchCommunityMessengerCallMissedOnce("session-2");

    expect(first.ok).toBe(true);
    expect(second.skipped).toBe(true);
    expect(runCallEndGuard).toHaveBeenCalledTimes(1);
  });
});
