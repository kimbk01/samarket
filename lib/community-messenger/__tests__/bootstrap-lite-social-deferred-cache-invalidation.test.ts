import { describe, expect, it } from "vitest";
import {
  invalidateBootstrapLiteSocialDeferred,
  invalidateBootstrapLiteSocialDeferredForPair,
  peekBootstrapLiteSocialDeferred,
  peekBootstrapLiteSocialDeferredGeneration,
  scheduleBootstrapLiteSocialGraphBackgroundHydration,
  storeBootstrapLiteSocialDeferred,
  storeBootstrapLiteSocialDeferredIfCurrent,
  type BootstrapLiteSocialDeferredSnapshot,
} from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";

function snap(blockedIds: string[]): BootstrapLiteSocialDeferredSnapshot {
  return {
    acceptedFriendRows: [],
    favoriteFriendIds: [],
    followingIds: [],
    hiddenIds: [],
    blockedIds,
    requestRows: [],
  };
}

describe("bootstrap lite social deferred cache — invalidation (A-1(3))", () => {
  it("invalidate clears entry and bumps generation", () => {
    storeBootstrapLiteSocialDeferred("inv-u1", snap([]));
    const g0 = peekBootstrapLiteSocialDeferredGeneration("inv-u1");
    invalidateBootstrapLiteSocialDeferred("inv-u1");
    expect(peekBootstrapLiteSocialDeferred("inv-u1").snapshot).toBeNull();
    expect(peekBootstrapLiteSocialDeferredGeneration("inv-u1")).toBe(g0 + 1);
  });

  it("pair invalidation clears owner and target", () => {
    storeBootstrapLiteSocialDeferred("inv-o", snap([]));
    storeBootstrapLiteSocialDeferred("inv-t", snap([]));
    invalidateBootstrapLiteSocialDeferredForPair("inv-o", "inv-t");
    expect(peekBootstrapLiteSocialDeferred("inv-o").snapshot).toBeNull();
    expect(peekBootstrapLiteSocialDeferred("inv-t").snapshot).toBeNull();
  });

  it("store-if-current drops a snapshot captured before an invalidation", () => {
    const g = peekBootstrapLiteSocialDeferredGeneration("inv-u2");
    invalidateBootstrapLiteSocialDeferred("inv-u2");
    expect(storeBootstrapLiteSocialDeferredIfCurrent("inv-u2", snap(["stale"]), g)).toBe(false);
    expect(peekBootstrapLiteSocialDeferred("inv-u2").snapshot).toBeNull();
    const g2 = peekBootstrapLiteSocialDeferredGeneration("inv-u2");
    expect(storeBootstrapLiteSocialDeferredIfCurrent("inv-u2", snap(["fresh"]), g2)).toBe(true);
    expect(peekBootstrapLiteSocialDeferred("inv-u2").snapshot?.blockedIds).toEqual(["fresh"]);
  });

  it("background hydration started before invalidate does not store stale snapshot", async () => {
    let release!: (s: BootstrapLiteSocialDeferredSnapshot) => void;
    const loader = () =>
      new Promise<BootstrapLiteSocialDeferredSnapshot>((resolve) => {
        release = resolve;
      });
    scheduleBootstrapLiteSocialGraphBackgroundHydration("inv-u3", loader);
    invalidateBootstrapLiteSocialDeferred("inv-u3");
    release(snap(["stale-before-block"]));
    await new Promise((r) => setTimeout(r, 0));
    expect(peekBootstrapLiteSocialDeferred("inv-u3").snapshot).toBeNull();
  });
});
