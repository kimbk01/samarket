import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => { throw new Error("no db in unit test"); } }));

import {
  MESSENGER_ROOM_BUMP_BOUNDED_ATTEMPT_TIMEOUTS_MS,
  publishMessengerRoomBumpAfterMutation,
  publishMessengerRoomBumpBounded,
} from "@/lib/community-messenger/server/publish-messenger-room-bump";

type PublishArgs = Parameters<typeof publishMessengerRoomBumpAfterMutation>[0];

const args = { rawRouteRoomId: "r", canonicalRoomId: "r", fromUserId: "u", messageId: "m1" };
const noSleep = async () => {};

describe("W4 publishMessengerRoomBumpBounded (bump result is separate from persist result)", () => {
  it("budget is two attempts ≤ 1.5s total", () => {
    const total = MESSENGER_ROOM_BUMP_BOUNDED_ATTEMPT_TIMEOUTS_MS.reduce((a, b) => a + b, 0) + 100;
    expect(MESSENGER_ROOM_BUMP_BOUNDED_ATTEMPT_TIMEOUTS_MS).toHaveLength(2);
    expect(total).toBeLessThanOrEqual(1500);
  });

  it("first success → 1 attempt", async () => {
    const publish = vi.fn(async (_a: PublishArgs) => ({ ok: true, status: 202 }));
    const r = await publishMessengerRoomBumpBounded(args, { publish, sleep: noSleep });
    expect(r).toEqual({ ok: true, attempts: 1, status: 202 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({ timeoutMs: 700 });
  });

  it("failure then success → retry without repeating badge target bump", async () => {
    const publish = vi
      .fn(async (_a: PublishArgs) => ({ ok: false, status: 0 }))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    const r = await publishMessengerRoomBumpBounded(args, { publish, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(publish.mock.calls[0][0].skipBadgeTargetBump).toBeUndefined();
    expect(publish.mock.calls[1][0]).toMatchObject({ skipBadgeTargetBump: true, timeoutMs: 600 });
  });

  it("never throws; two failures → ok:false (caller still ACKs 200)", async () => {
    const publish = vi.fn(async (_a: PublishArgs): Promise<{ ok: boolean; status: number }> => {
      throw new Error("network");
    });
    const r = await publishMessengerRoomBumpBounded(args, { publish, sleep: noSleep });
    expect(r).toEqual({ ok: false, attempts: 2, status: 0 });
  });
});
