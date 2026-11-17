import { describe, expect, it } from "vitest";
import { resolvePresenceStateWithStaleness } from "@/lib/community-messenger/presence/presence-staleness";
import { SAMARKET_PRESENCE_ONLINE_GRACE_MS } from "@/lib/community-messenger/presence/presence-policy";

const T0 = Date.parse("2026-10-15T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("resolvePresenceStateWithStaleness", () => {
  it("keeps fresh online and schedules the downgrade at the policy window", () => {
    const r = resolvePresenceStateWithStaleness({ state: "online", updatedAtIso: iso(T0), nowMs: T0 + 5_000 });
    expect(r.state).toBe("online");
    expect(r.nextChangeAtMs).toBe(T0 + SAMARKET_PRESENCE_ONLINE_GRACE_MS + 1);
  });

  it("P3: 「자리 비움」 단계 없이 online 창을 넘기면 바로 offline", () => {
    const r = resolvePresenceStateWithStaleness({
      state: "online",
      updatedAtIso: iso(T0),
      nowMs: T0 + SAMARKET_PRESENCE_ONLINE_GRACE_MS + 1,
    });
    expect(r).toEqual({ state: "offline", nextChangeAtMs: null });
  });

  it("leaves away/offline and online without an observation time untouched", () => {
    const late = T0 + 10 * 60_000;
    expect(resolvePresenceStateWithStaleness({ state: "away", updatedAtIso: iso(T0), nowMs: late }).state).toBe("away");
    expect(resolvePresenceStateWithStaleness({ state: "offline", updatedAtIso: iso(T0), nowMs: late }).state).toBe("offline");
    expect(resolvePresenceStateWithStaleness({ state: "online", updatedAtIso: null, nowMs: late })).toEqual({
      state: "online",
      nextChangeAtMs: null,
    });
    expect(resolvePresenceStateWithStaleness({ state: "online", updatedAtIso: "garbage", nowMs: late }).state).toBe("online");
  });
});
