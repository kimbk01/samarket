/**
 * @vitest-environment jsdom
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const registered: Array<() => void> = [];
const live = new Set<() => void>();
let unsubscribeCount = 0;

vi.mock("@/lib/delivery/owner/owner-surface-activity", () => ({
  isDeliveryOwnerSurfaceActive: () => false,
  subscribeDeliveryOwnerSurfaceActive: (listener: () => void) => {
    registered.push(listener);
    live.add(listener);
    return () => {
      unsubscribeCount += 1;
      live.delete(listener);
    };
  },
  markDeliveryOwnerSurfaceActive: () => () => {},
}));

import {
  enableOwnerHubBadgeBackgroundHydration,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";

/** stopHub 디바운스(120ms)보다 넉넉하게 */
const AFTER_HUB_STOP_MS = 400;

describe("owner hub badge — Owner surface activity subscription lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    registered.length = 0;
    live.clear();
    unsubscribeCount = 0;
    enableOwnerHubBadgeBackgroundHydration();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start → stop → start 후에도 살아있는 리스너는 1개뿐", () => {
    const off1 = subscribeOwnerHubBadge(() => {});
    expect(live.size).toBe(1);

    off1();
    vi.advanceTimersByTime(AFTER_HUB_STOP_MS);
    expect(unsubscribeCount).toBe(1);
    expect(live.size).toBe(0);

    const off2 = subscribeOwnerHubBadge(() => {});
    expect(live.size).toBe(1);
    expect(registered).toHaveLength(2);
    /** 재시작 시 이전 클로저가 아니라 새 클로저만 남는다 */
    expect(live.has(registered[0])).toBe(false);
    expect(live.has(registered[1])).toBe(true);

    off2();
    vi.advanceTimersByTime(AFTER_HUB_STOP_MS);
    expect(unsubscribeCount).toBe(2);
    expect(live.size).toBe(0);
  });
});
