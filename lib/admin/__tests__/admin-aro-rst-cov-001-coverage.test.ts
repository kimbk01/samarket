/**
 * ARO-RST-COV-001 — Reset coverage expansion contracts.
 * Framework ARO-RST-001 remains CLOSED; this proves selectable coverage + safe limits.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARO_RST_COV_001_DEPENDENCY_MATRIX } from "@/lib/admin/prelaunch-reset/aro-rst-cov-001-coverage-matrix";
import {
  PRELAUNCH_RESET_SELECTIVE_MATRIX,
  normalizeSelectedScopes,
  selectAllEligibleScopes,
} from "@/lib/admin/prelaunch-reset/selective-scopes";
import { normalizeSelector } from "@/lib/admin/prelaunch-reset/types";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { PRELAUNCH_RESET_HARD_LOCK } from "@/lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("ARO-RST-COV-001 Reset Coverage Expansion", () => {
  it("matrix promotes Owner-required non-finance scopes to selectable states", () => {
    const byKey = Object.fromEntries(PRELAUNCH_RESET_SELECTIVE_MATRIX.map((r) => [r.key, r]));
    expect(byKey.community_comments.support).toBe("SUPPORTED");
    expect(byKey.community_comments.selectAllEligible).toBe(true);
    expect(byKey.support.support).toBe("SUPPORTED");
    expect(byKey.feed_ads.support).toBe("SUPPORTED");
    expect(byKey.popup.support).toBe("SUPPORTED");
    expect(byKey.chat.support).toBe("PARTIAL");
    expect(byKey.coupons.support).toBe("PARTIAL");
    expect(byKey.notifications.support).toBe("PARTIAL");
    expect(byKey.members.support).toBe("PARTIAL");
    expect(byKey.stores.support).toBe("PARTIAL");
  });

  it("intentional safe limits remain BLOCKED", () => {
    const byKey = Object.fromEntries(PRELAUNCH_RESET_SELECTIVE_MATRIX.map((r) => [r.key, r]));
    for (const k of ["orders", "gifts", "point", "coin", "cash", "settlement"] as const) {
      expect(byKey[k].support).toBe("BLOCKED");
      expect(byKey[k].selectAllEligible).toBe(false);
    }
    expect(normalizeSelectedScopes(["orders", "gifts", "point", "community_comments"])).toEqual([
      "community_comments",
    ]);
  });

  it("select-all includes new coverage scopes and never financial BLOCKED", () => {
    const all = selectAllEligibleScopes();
    expect(all).toContain("community_comments");
    expect(all).toContain("support");
    expect(all).toContain("feed_ads");
    expect(all).toContain("popup");
    expect(all).toContain("chat");
    expect(all).toContain("coupons");
    expect(all).toContain("notifications");
    expect(all).not.toContain("orders");
    expect(all).not.toContain("gifts");
    expect(all).not.toContain("settlement");
  });

  it("dependency matrix documents each COV target with canonical blocker honesty", () => {
    const scopes = ARO_RST_COV_001_DEPENDENCY_MATRIX.map((r) => r.scope);
    for (const need of [
      "members",
      "stores",
      "community_comments",
      "chat",
      "feed_ads",
      "popup",
      "coupons",
      "support",
      "notifications",
    ]) {
      expect(scopes).toContain(need);
    }
    expect(ARO_RST_COV_001_DEPENDENCY_MATRIX.every((r) => r.blocker.length > 0 || r.safe === "SUPPORTED")).toBe(
      true
    );
  });

  it("selector normalizes COV-001 id fields", () => {
    const s = normalizeSelector({
      commentIds: [" c1 ", "c1"],
      supportCaseIds: ["s1"],
      feedAdCampaignIds: ["f1"],
      chatRoomIds: ["r1"],
    });
    expect(s.commentIds).toEqual(["c1"]);
    expect(s.supportCaseIds).toEqual(["s1"]);
    expect(s.feedAdCampaignIds).toEqual(["f1"]);
    expect(s.chatRoomIds).toEqual(["r1"]);
    expect(s.memberIds).toEqual([]);
  });

  it("planner/executor wire COV tables without parallel reset authority", () => {
    const planner = read("lib/admin/prelaunch-reset/planner.ts");
    const exec = read("lib/admin/prelaunch-reset/execute.ts");
    const ui = read("components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx");
    expect(planner).toContain("community_comments");
    expect(planner).toContain("feed_ad_campaigns");
    expect(planner).toContain("platform_popup");
    expect(planner).toContain("store_coupon_campaigns");
    expect(planner).toContain("support_cases");
    expect(planner).toContain("notification_events");
    expect(planner).toContain("community_messenger_rooms");
    expect(planner).toContain("protected_transaction_or_order_chat");
    expect(exec).toContain("community_comments");
    expect(exec).toContain("feed_ad_requests");
    expect(exec).toContain("support_cases");
    expect(exec).toContain("notification_events");
    expect(exec).not.toContain("point_ledger");
    expect(exec).not.toContain("business_cash_ledger");
    expect(exec).not.toContain("store_settlements");
    expect(exec).not.toContain("gift_certificate");
    expect(ui).toContain('data-aro-rst-cov-001="1"');
    expect(ui).toContain("commentIds");
    expect(ui).not.toContain("reset-v2");
  });

  it("C1 contract: comments-only delete preserves posts table path separation", () => {
    const exec = read("lib/admin/prelaunch-reset/execute.ts");
    expect(exec).toMatch(/step\.table === "community_comments"/);
    expect(exec).toMatch(/step\.table === "community_posts"/);
    const planner = read("lib/admin/prelaunch-reset/planner.ts");
    expect(planner).toContain("posts preserved");
  });

  it("X4/X7/X8: financial BLOCKED + production execute lock + admin protection unchanged", () => {
    expect(PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden).toBe(true);
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(read("lib/admin/prelaunch-reset/protection.ts")).toContain("admin_membership");
    expect(read("lib/admin/prelaunch-reset/planner.ts")).toContain("finance_rows_present_block");
  });
});
