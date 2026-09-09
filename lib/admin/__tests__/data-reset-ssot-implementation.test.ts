/**
 * DIBAY DATA RESET SSOT — IMPLEMENTATION targeted contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  confirmationMatchesPlan,
  buildDomainResetPlan,
} from "@/lib/admin/data-reset/planner";
import {
  DATA_RESET_CANONICAL_ROUTE,
  DATA_RESET_FORBIDDEN_OPS,
  DATA_RESET_B1B2_MIGRATION,
  hashDataResetPayload,
  issueDataResetOneTimeToken,
  verifyDataResetOneTimeToken,
  type DataResetPlan,
} from "@/lib/admin/data-reset/types";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import {
  CHAT_DOMAIN_RESET_POLICY,
  chatDataResetIsDetachOnly,
  chatDataResetUsesSoftTombstone,
} from "@/lib/admin/data-reset/chat-reset-policy";
import { DELIVERY_LAYER_RESET_POLICY } from "@/lib/admin/data-reset/domain-reset-boundary";
import { FRIEND_RESET_PLAN, FRIEND_RESET_EXECUTE_IMPLEMENTED } from "@/lib/admin/data-reset/friend-reset-policy";
import { ORDER_HARD_DELETE_BLOCKED } from "@/lib/admin/data-reset/order-hard-delete-policy";
import { STORE_ROW_DELETE_WHEN_FINANCE_PRESENT } from "@/lib/admin/data-reset/store-finance-fk-boundary";
import { PRELAUNCH_RESET_FORBIDDEN_OPS } from "@/lib/admin/prelaunch-reset/domain-inventory";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function mockSb(counts: Record<string, number> = {}) {
  return {
    from(table: string) {
      const state: {
        filters: Array<{ type: string; col?: string; val?: unknown }>;
      } = { filters: [] };
      const api: Record<string, unknown> = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          void _cols;
          if (opts?.head && opts.count === "exact") {
            return Promise.resolve({
              count: counts[table] ?? 0,
              error: null,
              data: null,
            });
          }
          return {
            eq() {
              return api;
            },
            in() {
              return api;
            },
            is() {
              return api;
            },
            or() {
              return api;
            },
            limit() {
              return Promise.resolve({ data: [], error: null });
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        eq(col: string, val: unknown) {
          state.filters.push({ type: "eq", col, val });
          return api;
        },
        in() {
          return api;
        },
        is() {
          return api;
        },
        or() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          return {
            eq() {
              return Promise.resolve({ count: 0, error: null });
            },
            in() {
              return Promise.resolve({ count: 0, error: null });
            },
            or() {
              return Promise.resolve({ count: 0, error: null });
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                is() {
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
            in() {
              return {
                is() {
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
          };
        },
      };
      // chain after select().eq for head count
      const selectFn = api.select as (
        cols?: string,
        opts?: { count?: string; head?: boolean }
      ) => unknown;
      api.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head && opts.count === "exact") {
          const chain: Record<string, unknown> = {
            eq() {
              return chain;
            },
            in() {
              return chain;
            },
            is() {
              return chain;
            },
            or() {
              return Promise.resolve({ count: counts[table] ?? 0, error: null, data: null });
            },
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve({
                count: counts[table] ?? 0,
                error: null,
                data: null,
              }).then(resolve);
            },
          };
          // make awaitable
          return Object.assign(
            Promise.resolve({ count: counts[table] ?? 0, error: null, data: null }),
            chain
          );
        }
        return selectFn(cols, opts);
      };
      return api;
    },
  };
}

describe("DATA RESET SSOT implementation", () => {
  it("canonical route + menu + redirect + wipe-all not wired", () => {
    expect(DATA_RESET_CANONICAL_ROUTE).toBe("/admin/system/data-reset");
    expect(read("app/admin/system/data-reset/page.tsx")).toContain("AdminDataResetPage");
    expect(read("app/admin/prelaunch-reset/page.tsx")).toContain("DATA_RESET_CANONICAL_ROUTE");
    expect(read("app/admin/prelaunch-reset/page.tsx")).toContain("redirect");
    expect(read("components/admin/admin-menu.ts")).toContain("/admin/system/data-reset");
    expect(DATA_RESET_FORBIDDEN_OPS.wipeAllAppDataSql).toContain("wipe-all-app-data.sql");
    expect(PRELAUNCH_RESET_FORBIDDEN_OPS.truncateCascadePublic).toContain("wipe-all-app-data.sql");
    const exec = read("lib/admin/data-reset/execute.ts");
    expect(exec).not.toContain("wipe-all-app-data");
    expect(exec).not.toContain("TRUNCATE");
    expect(exec).toContain("storageTargets");
    expect(read("lib/admin/data-reset/planner.ts")).toContain("storageTargetsHashIdentity");
  });

  it("preview and execute share buildDomainResetPlan authority", () => {
    const preview = read("app/api/admin/system/data-reset/preview/route.ts");
    const execute = read("app/api/admin/system/data-reset/execute/route.ts");
    const execLib = read("lib/admin/data-reset/execute.ts");
    expect(preview).toContain("buildDomainResetPlan");
    expect(execute).toContain("executeDomainReset");
    expect(execLib).toContain("revalidateDomainResetPlan");
    expect(execLib).toContain("buildDomainResetPlan");
    expect(preview).toContain("requireSuperAdmin");
    expect(execute).toContain("requireSuperAdmin");
  });

  it("hash binding + one-time token helpers", () => {
    const a = hashDataResetPayload({ x: 1 });
    const b = hashDataResetPayload({ x: 1 });
    const c = hashDataResetPayload({ x: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const tok = issueDataResetOneTimeToken({
      planId: "p1",
      planHash: "h1",
      actorUserId: "u1",
    });
    expect(
      verifyDataResetOneTimeToken(tok, { planId: "p1", planHash: "h1", actorUserId: "u1" })
    ).toBe(true);
    expect(
      verifyDataResetOneTimeToken(tok, { planId: "p1", planHash: "h2", actorUserId: "u1" })
    ).toBe(false);
  });

  it("production execute always forbidden via env gate", () => {
    const gate = resolveDataResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      DATA_RESET_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(gate.reasons).toContain("production_execute_forbidden");
  });

  it("domain policies: community/market/delivery/chat/friend/member/finance/full", async () => {
    const sb = mockSb({
      community_posts: 10,
      community_comments: 20,
      posts: 5,
      store_products: 3,
      community_messenger_rooms: 7,
      user_social_relations: 4,
      profiles: 9,
      point_ledger: 100,
      business_cash_ledger: 50,
      gift_certificate_instances: 2,
      store_economic_point_ledger: 8,
    }) as never;

    const community = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all", mode: "preview" },
    });
    expect(community.preserve).toEqual(
      expect.arrayContaining(["profiles", "posts", "community_messenger_rooms", "finance ledgers"])
    );
    expect(community.delete.some((d) => d.table === "community_posts")).toBe(true);

    const market = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "market", scope: "all", mode: "preview" },
    });
    expect(market.detach.some((d) => d.action === "DETACH")).toBe(true);
    expect(market.preserveSummary.join(" ")).toMatch(/DETACH|trade/i);

    const delivery = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "delivery", scope: "all", subtype: "operating", mode: "preview" },
    });
    expect(DELIVERY_LAYER_RESET_POLICY.finance).toBe("PRESERVE");
    expect(STORE_ROW_DELETE_WHEN_FINANCE_PRESENT).toBe("FORBIDDEN");
    expect(ORDER_HARD_DELETE_BLOCKED).toBe(true);
    expect(delivery.preserve.join(" ")).toMatch(/store_orders|gift|cash/i);
    expect(delivery.delete.every((d) => d.table !== "store_orders")).toBe(true);
    expect(delivery.delete.every((d) => d.table !== "stores")).toBe(true);

    expect(chatDataResetUsesSoftTombstone("group")).toBe(true);
    expect(chatDataResetIsDetachOnly("trade")).toBe(true);
    expect(CHAT_DOMAIN_RESET_POLICY.store_order.listingOrOrderDeleteImpliesRoomDelete).toBe(false);

    const chat = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "chat", scope: "all", mode: "preview" },
    });
    expect(chat.softDelete.length).toBeGreaterThan(0);
    expect(chat.detach.length).toBeGreaterThan(0);
    expect(chat.delete.every((d) => d.table !== "community_messenger_rooms")).toBe(true);

    expect(FRIEND_RESET_EXECUTE_IMPLEMENTED).toBe(true);
    expect(FRIEND_RESET_PLAN["friend:user"].matchMode).toBe("either_endpoint");
    expect(FRIEND_RESET_PLAN["friend:user"].preserve).toContain("community_messenger_rooms");

    const memberAuth = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: {
        domain: "member",
        scope: "user",
        subtype: "auth_delete",
        entityId: "u1",
        mode: "preview",
      },
    });
    expect(memberAuth.blockers.length).toBeGreaterThan(0);
    expect(memberAuth.blockedReason).toBe("AUTH_ACCOUNT_DELETE_BLOCKED");

    const finance = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "finance", scope: "all", mode: "preview" },
    });
    expect(finance.executeAllowed).toBe(false);
    expect(finance.blockedReason).toBe("FINANCIAL_HARD_RESET_PREVIEW_ONLY");

    const full = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "full", scope: "all", mode: "preview" },
    });
    expect(full.preserveSummary.join(" ")).toMatch(/FINANCIAL HARD RESET|TRUNCATE|AUTH/i);
    expect(full.blocked).toEqual(
      expect.arrayContaining(["finance_hard_reset", "wipe_all_app_data_sql"])
    );
  });

  it("confirmation phrase binding", () => {
    const plan = {
      typedConfirmationPhrase: "COMMUNITY RESET abcdef12",
    } as DataResetPlan;
    expect(confirmationMatchesPlan(plan, "COMMUNITY RESET abcdef12")).toBe(true);
    expect(confirmationMatchesPlan(plan, "wrong")).toBe(false);
  });

  it("B1/B2 migration file present (local) — Production apply not claimed", () => {
    expect(DATA_RESET_B1B2_MIGRATION).toContain("20261213120000_data_reset_blocker_close");
    expect(read(DATA_RESET_B1B2_MIGRATION)).toContain("RESTRICT");
    const planner = read("lib/admin/data-reset/planner.ts");
    expect(planner).toContain("productionFkAssumeRestrict: false");
  });

  it("UI is list-based not card dashboard", () => {
    const ui = read("components/admin/system/AdminDataResetPage.tsx");
    expect(ui).toContain("<table");
    expect(ui).toContain("Full Service Reset");
    expect(ui).toContain("/api/admin/system/data-reset/preview");
    expect(ui).toContain("/api/admin/system/data-reset/execute");
  });
});
