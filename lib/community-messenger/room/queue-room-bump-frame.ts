/**
 * M-3 — same-frame room bumps must not drop prior payloads when coalescing to one rAF.
 */

export type QueuedRoomBumpFrameItem<T> = T;

/**
 * Enqueue a bump for the next animation frame. Does not cancel an already-scheduled
 * frame — later bumps append so the flush sees the full batch.
 */
export function enqueueRoomBumpFrameItem<T>(args: {
  queue: QueuedRoomBumpFrameItem<T>[];
  item: QueuedRoomBumpFrameItem<T>;
  rafId: number | null;
  schedule: (cb: () => void) => number;
  flush: (batch: QueuedRoomBumpFrameItem<T>[]) => void;
}): number {
  args.queue.push(args.item);
  if (args.rafId != null) return args.rafId;
  return args.schedule(() => {
    const batch = args.queue.splice(0, args.queue.length);
    if (batch.length === 0) return;
    args.flush(batch);
  });
}
