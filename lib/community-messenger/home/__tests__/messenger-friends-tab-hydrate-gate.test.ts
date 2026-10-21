import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MESSENGER_FRIENDS_TAB_HYDRATE_FRESH_MS,
  shouldHydrateMessengerFriendsOnTabEntry,
} from "@/lib/community-messenger/home/messenger-friends-tab-hydrate-gate";

const base = {
  alreadyRequestedThisEntry: false,
  hasData: true,
  friendsCount: 5,
  clientHydrationTier: "full" as const,
  lastSuccessAt: 1_000_000,
  now: 1_000_000 + 1_000,
};

describe("P-3 friends tab GET /friends gate", () => {
  it("fresh full-tier non-empty data → no fetch", () => {
    expect(shouldHydrateMessengerFriendsOnTabEntry(base)).toBe(false);
  });

  it("empty, lite/critical, stale, or never fetched → fetch", () => {
    expect(shouldHydrateMessengerFriendsOnTabEntry({ ...base, friendsCount: 0 })).toBe(true);
    expect(shouldHydrateMessengerFriendsOnTabEntry({ ...base, clientHydrationTier: "critical" })).toBe(true);
    expect(shouldHydrateMessengerFriendsOnTabEntry({ ...base, clientHydrationTier: undefined })).toBe(true);
    expect(
      shouldHydrateMessengerFriendsOnTabEntry({ ...base, now: base.lastSuccessAt + MESSENGER_FRIENDS_TAB_HYDRATE_FRESH_MS })
    ).toBe(true);
    expect(shouldHydrateMessengerFriendsOnTabEntry({ ...base, lastSuccessAt: 0 })).toBe(true);
  });

  it("no data yet → wait (no fetch)", () => {
    expect(shouldHydrateMessengerFriendsOnTabEntry({ ...base, hasData: false, friendsCount: 0 })).toBe(false);
  });

  it("one tab entry → at most 1 call even as tier/length change after the response", () => {
    /** simulate the Home effect re-running on friends.length / tier changes within one entry */
    let requested = false;
    let calls = 0;
    const states = [
      { friendsCount: 0, clientHydrationTier: "critical" as const, lastSuccessAt: 0 },
      { friendsCount: 12, clientHydrationTier: "critical" as const, lastSuccessAt: base.now },
      { friendsCount: 12, clientHydrationTier: "full" as const, lastSuccessAt: base.now },
    ];
    for (const s of states) {
      if (shouldHydrateMessengerFriendsOnTabEntry({ ...base, ...s, alreadyRequestedThisEntry: requested })) {
        requested = true;
        calls += 1;
      }
    }
    expect(calls).toBe(1);
  });

  it("Home wires the gate with a per-entry ref; explicit invalidation stays direct", () => {
    const src = readFileSync(join(process.cwd(), "components/community-messenger/CommunityMessengerHome.tsx"), "utf8");
    expect(src).toContain("shouldHydrateMessengerFriendsOnTabEntry({");
    expect(src).toContain("friendsTabEntryRequestedRef.current = false");
    expect(src).toMatch(/cm\.home\.social_sync[\s\S]{0,200}void hydrateMessengerFriends\(\)/);
    expect(src).toContain("onSocialGraphChanged: hydrateMessengerFriends");
    const boot = readFileSync(join(process.cwd(), "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts"), "utf8");
    expect(boot).toContain("friendsLastHydratedAtRef.current = Date.now()");
  });
});
