/**
 * ARO-RST-001 — Selective Reset contracts (selection / select-all / hash / matrix honesty).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { PRELAUNCH_RESET_HARD_LOCK } from "@/lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock";
import {
  PRELAUNCH_RESET_SELECTIVE_MATRIX,
  defaultScopesForPreset,
  normalizeSelectedScopes,
  selectAllEligibleScopes,
} from "@/lib/admin/prelaunch-reset/selective-scopes";
import { hashPlanPayload } from "@/lib/admin/prelaunch-reset/types";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("ARO-RST-001 Selective Reset", () => {
  it("matrix covers Owner entity list with honest support statuses", () => {
    const byKey = Object.fromEntries(PRELAUNCH_RESET_SELECTIVE_MATRIX.map((r) => [r.key, r]));
    expect(byKey.members.support).toBe("PARTIAL");
    expect(byKey.stores.support).toBe("PARTIAL");
    expect(byKey.community_posts.support).toBe("SUPPORTED");
    expect(byKey.community_comments.support).toBe("SUPPORTED");
    expect(byKey.trade_content.support).toBe("SUPPORTED");
    expect(byKey.chat.support).toBe("PARTIAL");
    expect(byKey.orders.support).toBe("BLOCKED");
    expect(byKey.delivery_ads.support).toBe("SUPPORTED");
    expect(byKey.feed_ads.support).toBe("SUPPORTED");
    expect(byKey.popup.support).toBe("SUPPORTED");
    expect(byKey.coupons.support).toBe("PARTIAL");
    expect(byKey.gifts.support).toBe("BLOCKED");
    expect(byKey.support.support).toBe("SUPPORTED");
    expect(byKey.notifications.support).toBe("PARTIAL");
    expect(byKey.point.support).toBe("BLOCKED");
    expect(byKey.coin.support).toBe("BLOCKED");
    expect(byKey.cash.support).toBe("BLOCKED");
    expect(byKey.settlement.support).toBe("BLOCKED");
    expect(byKey.storage.support).toBe("SUPPORTED");
    expect(byKey.auth.support).toBe("SUPPORTED");
  });

  it("select-all only includes SUPPORTED|PARTIAL — never BLOCKED/NOT_SUPPORTED", () => {
    const all = selectAllEligibleScopes();
    expect(all.length).toBeGreaterThan(0);
    for (const key of all) {
      const row = PRELAUNCH_RESET_SELECTIVE_MATRIX.find((r) => r.key === key)!;
      expect(row.selectAllEligible).toBe(true);
      expect(["SUPPORTED", "PARTIAL"]).toContain(row.support);
    }
    expect(all).not.toContain("orders");
    expect(all).not.toContain("gifts");
    expect(all).toContain("chat");
    expect(all).toContain("community_comments");
    expect(all).toContain("feed_ads");
    expect(all).toContain("popup");
  });

  it("normalizeSelectedScopes drops blocked/unsupported and sorts", () => {
    expect(
      normalizeSelectedScopes(["orders", "trade_content", "gifts", "trade_content", "storage"])
    ).toEqual(["storage", "trade_content"]);
  });

  it("planHash includes selectedScopes — selection change invalidates", () => {
    const base = {
      preset: "TEST_CONTENT_ONLY",
      selectedScopes: ["community_posts", "storage"],
      selector: { contentIds: ["c1"], memberIds: [], storeIds: [], deliveryAdCampaignIds: [] },
      counts: { content: 1 },
      blockers: [],
    };
    const h1 = hashPlanPayload(base);
    const h2 = hashPlanPayload({
      ...base,
      selectedScopes: ["community_posts", "trade_content", "storage"],
    });
    expect(h1).not.toBe(h2);
  });

  it("defaultScopesForPreset never auto-selects orders; may include feed/popup when preset includes them", () => {
    const scopes = defaultScopesForPreset([
      "TRADE",
      "COMMUNITY",
      "ADS_DELIVERY",
      "ADS_FEED",
      "POPUP",
      "MEMBER",
    ]);
    expect(scopes).toContain("trade_content");
    expect(scopes).toContain("community_posts");
    expect(scopes).toContain("community_comments");
    expect(scopes).toContain("delivery_ads");
    expect(scopes).toContain("feed_ads");
    expect(scopes).toContain("popup");
    expect(scopes).not.toContain("orders");
  });

  it("UI uses checkboxes + select-all; no radio; no parallel reset-v2", () => {
    const ui = read("components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx");
    expect(ui).toContain('type="checkbox"');
    expect(ui).toContain("data-aro-rst-select-all");
    expect(ui).toContain("data-aro-rst-scope-matrix");
    expect(ui).not.toContain('type="radio"');
    expect(ui).not.toContain("reset-v2");
    expect(ui).toContain("selectedScopes");
    const dry = read("app/api/admin/prelaunch-reset/dry-run/route.ts");
    const exec = read("app/api/admin/prelaunch-reset/execute/route.ts");
    expect(dry).toContain("selectedScopes");
    expect(exec).toContain("selectedScopes");
    expect(read("lib/admin/prelaunch-reset/planner.ts")).toContain("selectedScopes");
    expect(read("lib/admin/prelaunch-reset/execute.ts")).toContain("community_posts");
  });

  it("Production execute remains ALWAYS BLOCKED", () => {
    expect(PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden).toBe(true);
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(gate.dryRunAllowed).toBe(true);
  });

  it("no parallel planner/executor authority invented", () => {
    expect(read("lib/admin/prelaunch-reset/index.ts")).toContain("buildPrelaunchResetPlan");
    expect(read("lib/admin/prelaunch-reset/index.ts")).toContain("executePrelaunchReset");
    expect(read("lib/admin/prelaunch-reset/index.ts")).toContain("PRELAUNCH_RESET_SELECTIVE_MATRIX");
  });
});
