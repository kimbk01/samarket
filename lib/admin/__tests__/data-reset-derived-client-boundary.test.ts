/**
 * DIBAY Data Reset — derived state + client invalidation boundary contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN,
  DATA_RESET_DERIVED_INVENTORY,
  derivedTargetsHashIdentity,
  resolveDerivedStateResetPlan,
} from "@/lib/admin/data-reset/derived-state";
import { DATA_RESET_CLIENT_INVALIDATION_SOURCE_FORBIDDEN } from "@/lib/admin/data-reset/client-invalidation";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("DATA_RESET_DERIVED_INVENTORY", () => {
  it("covers community/market/delivery/chat/friend/member/finance", () => {
    const domains = new Set(DATA_RESET_DERIVED_INVENTORY.map((r) => r.domain));
    for (const d of [
      "community",
      "market",
      "delivery",
      "chat",
      "friend",
      "member",
      "finance",
    ] as const) {
      expect(domains.has(d)).toBe(true);
    }
  });
});

describe("resolveDerivedStateResetPlan", () => {
  it("community → community_feed INVALIDATE", () => {
    const r = resolveDerivedStateResetPlan({ domain: "community", scope: "all" });
    expect(r.derivedStateTargets.some((t) => t.operation === "INVALIDATE")).toBe(true);
    expect(r.clientInvalidation).toContain("community_feed");
  });

  it("market → market_feed", () => {
    const r = resolveDerivedStateResetPlan({ domain: "market", scope: "all" });
    expect(r.clientInvalidation).toEqual(["market_feed"]);
    expect(r.derivedStateTargets[0]?.kind).toBe("market_feed_cache");
  });

  it("delivery → delivery_browse", () => {
    const r = resolveDerivedStateResetPlan({ domain: "delivery", scope: "all" });
    expect(r.clientInvalidation).toEqual(["delivery_browse"]);
  });

  it("chat → hub_badge DELETE + chat namespaces; finance PRESERVE", () => {
    const chat = resolveDerivedStateResetPlan({ domain: "chat", scope: "all" });
    expect(
      chat.derivedStateTargets.some(
        (t) => t.kind === "hub_badge_user_unread_counters" && t.operation === "DELETE"
      )
    ).toBe(true);
    expect(chat.clientInvalidation).toEqual(
      ["chat_bootstrap", "chat_room_snapshots", "hub_badge_memory"].sort()
    );

    const finance = resolveDerivedStateResetPlan({ domain: "finance", scope: "all" });
    expect(finance.derivedStateTargets.every((t) => t.operation === "PRESERVE")).toBe(true);
    expect(finance.clientInvalidation).toEqual([]);
  });

  it("member PRESERVE auth", () => {
    const r = resolveDerivedStateResetPlan({ domain: "member", scope: "user" });
    expect(r.derivedStateTargets.some((t) => t.kind === "auth_session" && t.operation === "PRESERVE")).toBe(
      true
    );
    expect(r.clientInvalidation).toEqual([]);
    expect(r.warnings).toContain("member_auth_session_preserved");
  });
});

describe("derivedTargetsHashIdentity", () => {
  it("is order-stable", () => {
    const a = derivedTargetsHashIdentity([
      {
        kind: "b",
        ownerDomain: "market",
        operation: "INVALIDATE",
        identity: "i2",
        estimatedRows: 0,
        notes: "",
      },
      {
        kind: "a",
        ownerDomain: "community",
        operation: "INVALIDATE",
        identity: "i1",
        estimatedRows: 0,
        notes: "",
      },
    ]);
    const b = derivedTargetsHashIdentity([
      {
        kind: "a",
        ownerDomain: "community",
        operation: "INVALIDATE",
        identity: "i1",
        estimatedRows: 0,
        notes: "",
      },
      {
        kind: "b",
        ownerDomain: "market",
        operation: "INVALIDATE",
        identity: "i2",
        estimatedRows: 0,
        notes: "",
      },
    ]);
    expect(a).toEqual(b);
    expect(a.map((x) => x.kind)).toEqual(["a", "b"]);
  });
});

describe("client-invalidation source forbidden clears", () => {
  it("forbids localStorage.clear / sessionStorage.clear / wipeClientSessionState", () => {
    const src = read("lib/admin/data-reset/client-invalidation.ts");
    expect(DATA_RESET_CLIENT_INVALIDATION_SOURCE_FORBIDDEN).toEqual(
      expect.arrayContaining([
        "localStorage.clear(",
        "sessionStorage.clear(",
        "wipeClientSessionState(",
      ])
    );
    // Contract list may mention fragments; strip it then assert no live calls remain.
    const withoutContractList = src.replace(
      /export const DATA_RESET_CLIENT_INVALIDATION_SOURCE_FORBIDDEN[\s\S]*?as const;/,
      ""
    );
    expect(withoutContractList).not.toMatch(/localStorage\.clear\s*\(/);
    expect(withoutContractList).not.toMatch(/sessionStorage\.clear\s*\(/);
    expect(withoutContractList).not.toMatch(/wipeClientSessionState\s*\(/);
  });
});

describe("planner / execute wiring", () => {
  it("planner contains derivedTargetsHashIdentity + resolveDerivedStateResetPlan", () => {
    const planner = read("lib/admin/data-reset/planner.ts");
    expect(planner).toContain("derivedTargetsHashIdentity");
    expect(planner).toContain("resolveDerivedStateResetPlan");
    expect(planner).toContain("clientInvalidationHashIdentity");
  });

  it("planHash payload includes derived + client invalidation identities", () => {
    const planner = read("lib/admin/data-reset/planner.ts");
    expect(planner).toMatch(/derivedStateTargets:\s*derivedTargetsHashIdentity/);
    expect(planner).toMatch(/clientInvalidation:\s*clientInvalidationHashIdentity/);
  });

  it("execute contains executeDerivedStateReset and runs derived before storage", () => {
    const execute = read("lib/admin/data-reset/execute.ts");
    expect(execute).toContain("executeDerivedStateReset");
    const derivedIdx = execute.indexOf("executeDerivedStateReset");
    const storageIdx = execute.indexOf("runStorageActions");
    expect(derivedIdx).toBeGreaterThan(-1);
    expect(storageIdx).toBeGreaterThan(-1);
    expect(derivedIdx).toBeLessThan(storageIdx);
  });

  it("Admin preview surfaces SERVER DERIVED + CLIENT INVALIDATION", () => {
    const ui = read("components/admin/system/AdminDataResetPage.tsx");
    expect(ui).toContain("SERVER DERIVED RESET");
    expect(ui).toContain("CLIENT INVALIDATION");
    expect(ui).toContain("derivedStateTargets");
    expect(ui).toContain("clientInvalidation");
    expect(ui).not.toContain("wipeClientSessionState");
  });
});

describe("forbidden / native boundary", () => {
  it("DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN authSignOut false", () => {
    expect(DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN.authSignOut).toBe(false);
    expect(DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN.wipeClientSessionState).toBe(false);
    expect(DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN.nativeCallLifecycle).toBe(false);
  });

  it("no NativeIncomingCallPlugin / MainActivity in derived-state or client-invalidation", () => {
    const derived = read("lib/admin/data-reset/derived-state.ts");
    const client = read("lib/admin/data-reset/client-invalidation.ts");
    for (const src of [derived, client]) {
      expect(src).not.toContain("NativeIncomingCallPlugin");
      expect(src).not.toContain("MainActivity");
    }
  });
});
