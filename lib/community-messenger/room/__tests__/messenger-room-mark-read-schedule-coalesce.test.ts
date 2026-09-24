/**
 * Unit mirror of mark-read schedule coalesce / eventual-flush ownership.
 * Production owner: useMessengerRoomOpenMarkReadEffect.scheduleRoomReadAck
 * Keep in sync with that repair — T1–T6.
 */
import { describe, expect, it, vi } from "vitest";

type Reason = "initial-render" | "near-bottom" | "resize" | "mutation" | "incoming-visible";

function createCoalesceScheduler(args: {
  resolve: (reason: Reason) => string | null;
  flush: (reason: Reason, candidate: string) => void;
  optimistic?: (reason: Reason, candidate: string) => void;
}) {
  let cancelled = false;
  let rafId: number | null = null;
  let latest: Reason = "initial-render";
  const schedule = (reason: Reason) => {
    latest = reason;
    if (rafId != null) return;
    rafId = 1;
    queueMicrotask(() => {
      rafId = null;
      if (cancelled) return;
      const r = latest;
      const candidate = args.resolve(r);
      if (!candidate) return;
      args.optimistic?.(r, candidate);
      args.flush(r, candidate);
    });
  };
  return {
    schedule,
    cancelAll: () => {
      cancelled = true;
      rafId = null;
    },
  };
}

describe("mark-read schedule coalesce (eventual flush)", () => {
  it("T1 single candidate → flush once", async () => {
    const flush = vi.fn();
    const s = createCoalesceScheduler({
      resolve: () => "msg-a",
      flush,
    });
    s.schedule("initial-render");
    await Promise.resolve();
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("initial-render", "msg-a");
  });

  it("T2 schedule storm → eventual flush >= 1", async () => {
    const flush = vi.fn();
    let n = 0;
    const s = createCoalesceScheduler({
      resolve: () => {
        n += 1;
        return "msg-a";
      },
      flush,
    });
    s.schedule("near-bottom");
    s.schedule("resize");
    s.schedule("mutation");
    s.schedule("resize");
    await Promise.resolve();
    await Promise.resolve();
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(n).toBe(1);
  });

  it("T3 latest cursor wins after storm", async () => {
    const flush = vi.fn();
    let cursor = "msg-a";
    const s = createCoalesceScheduler({
      resolve: () => cursor,
      flush,
    });
    s.schedule("near-bottom");
    cursor = "msg-b";
    s.schedule("mutation");
    await Promise.resolve();
    await Promise.resolve();
    expect(flush).toHaveBeenCalledWith("mutation", "msg-b");
  });

  it("T4 duplicate candidate — flush may run; caller must be idempotent (FR-03)", async () => {
    const seen = new Set<string>();
    const flush = vi.fn((_: Reason, c: string) => {
      if (seen.has(c)) return;
      seen.add(c);
    });
    const s = createCoalesceScheduler({
      resolve: () => "msg-a",
      flush,
    });
    s.schedule("initial-render");
    await Promise.resolve();
    await Promise.resolve();
    s.schedule("near-bottom");
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.size).toBe(1);
  });

  it("T5 monotonic — older candidate does not flush after newer persisted", async () => {
    const persisted = "msg-b";
    const flush = vi.fn();
    const s = createCoalesceScheduler({
      resolve: () => {
        const next = "msg-a";
        if (persisted === "msg-b") return null;
        return next;
      },
      flush,
    });
    s.schedule("near-bottom");
    await Promise.resolve();
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
  });

  it("T6 optimistic + persistence — flush still runs after optimistic", async () => {
    const order: string[] = [];
    const s = createCoalesceScheduler({
      resolve: () => "msg-a",
      optimistic: () => {
        order.push("optimistic");
      },
      flush: () => {
        order.push("flush");
      },
    });
    s.schedule("near-bottom");
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["optimistic", "flush"]);
  });
});

describe("mark-read schedule source contract", () => {
  it("does not unconditionally clear pending schedule on every enter", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"),
      "utf8"
    );
    const start = src.indexOf("const scheduleRoomReadAck = ");
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, start + 1800);
    expect(block).toContain("if (readAckRafId != null)");
    expect(block).toContain("flushRoomReadAck(scheduleReason, candidate)");
    expect(block).not.toMatch(/clearScheduledReadAck\(\);\s*\n\s*const run/);
    expect(block).not.toContain("CM_MARK_READ_SCROLL_DEBOUNCE_MS);");
  });
});
