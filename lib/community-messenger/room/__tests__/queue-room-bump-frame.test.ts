import { describe, expect, it, vi } from "vitest";
import { enqueueRoomBumpFrameItem } from "@/lib/community-messenger/room/queue-room-bump-frame";

describe("enqueueRoomBumpFrameItem (M-3)", () => {
  it("keeps two same-frame bumps and flushes both once", () => {
    const queue: string[] = [];
    let rafId: number | null = null;
    let scheduled: (() => void) | null = null;
    const flush = vi.fn((batch: string[]) => {
      expect(batch).toEqual(["a", "b"]);
    });

    rafId = enqueueRoomBumpFrameItem({
      queue,
      item: "a",
      rafId,
      schedule: (cb) => {
        scheduled = cb;
        return 1;
      },
      flush,
    });
    rafId = enqueueRoomBumpFrameItem({
      queue,
      item: "b",
      rafId,
      schedule: () => {
        throw new Error("must not schedule a second frame");
      },
      flush,
    });

    expect(queue).toEqual(["a", "b"]);
    scheduled?.();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(queue).toEqual([]);
  });

  it("dedupes identical payloads only via caller (queue preserves order)", () => {
    const queue: number[] = [];
    let rafId: number | null = null;
    let scheduled: (() => void) | null = null;
    const seen: number[][] = [];
    rafId = enqueueRoomBumpFrameItem({
      queue,
      item: 1,
      rafId,
      schedule: (cb) => {
        scheduled = cb;
        return 7;
      },
      flush: (batch) => seen.push([...batch]),
    });
    rafId = enqueueRoomBumpFrameItem({
      queue,
      item: 2,
      rafId,
      schedule: () => 7,
      flush: (batch) => seen.push([...batch]),
    });
    scheduled?.();
    expect(seen).toEqual([[1, 2]]);
  });

  it("cleared queue before flush runs yields empty batch (unmount)", () => {
    const queue: string[] = [];
    let scheduled: (() => void) | null = null;
    const flush = vi.fn();
    enqueueRoomBumpFrameItem({
      queue,
      item: "x",
      rafId: null,
      schedule: (cb) => {
        scheduled = cb;
        return 3;
      },
      flush,
    });
    queue.length = 0;
    scheduled?.();
    expect(flush).not.toHaveBeenCalled();
  });
});
