import { beforeEach, describe, expect, it, vi } from "vitest";

const patchCommunityMessengerCallSession = vi.fn();

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: (...args: unknown[]) => patchCommunityMessengerCallSession(...args),
}));

describe("patchCommunityMessengerCallMissedOnce", () => {
  beforeEach(() => {
    vi.resetModules();
    patchCommunityMessengerCallSession.mockReset();
  });

  it("single-flights concurrent missed PATCH for the same session", async () => {
    let resolvePatch!: (value: { ok: boolean }) => void;
    const pending = new Promise<{ ok: boolean }>((resolve) => {
      resolvePatch = resolve;
    });
    patchCommunityMessengerCallSession.mockReturnValue(pending);

    const { patchCommunityMessengerCallMissedOnce } = await import(
      "@/lib/community-messenger/messenger-call-missed-patch"
    );

    const first = patchCommunityMessengerCallMissedOnce("session-1");
    const second = patchCommunityMessengerCallMissedOnce("session-1");

    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);

    resolvePatch({ ok: true });
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.ok).toBe(true);
    expect(r2.skipped).toBe(true);
  });

  it("skips duplicate missed PATCH after success tombstone", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "session-2" } });

    const { patchCommunityMessengerCallMissedOnce } = await import(
      "@/lib/community-messenger/messenger-call-missed-patch"
    );

    const first = await patchCommunityMessengerCallMissedOnce("session-2");
    const second = await patchCommunityMessengerCallMissedOnce("session-2");

    expect(first.ok).toBe(true);
    expect(second.skipped).toBe(true);
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
  });
});
