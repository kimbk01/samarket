import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeTabLeader } from "@/lib/runtime/leader-tab-coordinator";

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  name: string;
  listeners = new Set<(ev: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      for (const listener of peer.listeners) {
        listener({ data } as MessageEvent);
      }
    }
  }

  addEventListener(_type: "message", listener: (ev: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (ev: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  close() {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
    this.listeners.clear();
  }
}

describe("subscribeTabLeader", () => {
  beforeEach(() => {
    MockBroadcastChannel.channels.clear();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls onChange only when leader flag changes", () => {
    const onChange = vi.fn();
    const unsub = subscribeTabLeader("test-scope", onChange);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);

    onChange.mockClear();
    vi.advanceTimersByTime(2500);
    expect(onChange).not.toHaveBeenCalled();

    unsub();
  });
});
