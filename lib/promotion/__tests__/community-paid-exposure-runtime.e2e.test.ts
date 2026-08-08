/**
 * Runtime proof (service role) — Community Paid Exposure money + entitlement.
 * Run: RUN_REVENUE_E2E=1 npx vitest run lib/promotion/__tests__/community-paid-exposure-runtime.e2e.test.ts
 *
 * Uses temporary admin_credit then reject/capture paths; cleans leftover holds.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCommunityPaidExposurePending,
  approveCommunityPaidExposure,
  rejectCommunityPaidExposure,
} from "@/lib/promotion/apply-community-paid-exposure";
import { fetchActiveCommunityPaidExposureFeedPosts } from "@/lib/promotion/community-paid-exposure-feed";
import { creditUserPoints, readUserPointBalance } from "@/lib/points/user-point-ledger";

const RUN = process.env.RUN_REVENUE_E2E === "1";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

describe.runIf(RUN)("community paid exposure runtime E2E", () => {
  it(
    "reject releases hold; approve captures + feed topic isolation",
    async () => {
      loadEnv();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      expect(url && key).toBeTruthy();
      const sb = createClient(url!, key!, { auth: { persistSession: false } });

      const { data: post } = await sb
        .from("community_posts")
        .select("id, user_id, title, topic_slug, category")
        .eq("status", "active")
        .eq("is_hidden", false)
        .not("user_id", "is", null)
        .limit(1)
        .maybeSingle();
      expect(post?.id).toBeTruthy();
      const userId = String(post!.user_id);
      const postId = String(post!.id);
      const topic = String(post!.topic_slug ?? post!.category ?? "").trim();

      const creditId = `qa-community-promo:${randomUUID()}`;
      const credited = await creditUserPoints(sb, {
        userId,
        amount: 10000,
        entryType: "admin_credit",
        relatedType: "admin_manual",
        relatedId: creditId,
        description: "QA community paid exposure runtime (temporary)",
        actorType: "admin",
      });
      expect(credited.ok).toBe(true);
      const before = await readUserPointBalance(sb, userId);
      expect(before).toBeGreaterThanOrEqual(10000);

      // --- Reject path ---
      const rejectApply = await applyCommunityPaidExposurePending(sb, {
        userId,
        postId,
        productId: "community_promote_3",
        targetTitle: String(post!.title ?? ""),
        userNickname: "qa",
        idempotencyKey: `qa-reject-${randomUUID()}`,
      });
      expect(rejectApply.ok).toBe(true);
      if (!rejectApply.ok) return;
      const afterHold = await readUserPointBalance(sb, userId);
      expect(afterHold).toBe(before - 10000);
      const { data: holdRows } = await sb
        .from("promotion_point_holds")
        .select("id, status, amount")
        .eq("promotion_order_id", rejectApply.orderId)
        .eq("status", "held");
      expect((holdRows ?? []).length).toBe(1);

      const rejected = await rejectCommunityPaidExposure(sb, {
        orderId: rejectApply.orderId,
        reason: "QA reject release proof",
      });
      expect(rejected.ok).toBe(true);
      const afterRelease = await readUserPointBalance(sb, userId);
      expect(afterRelease).toBe(before);
      const { data: holdAfterReject } = await sb
        .from("promotion_point_holds")
        .select("status")
        .eq("promotion_order_id", rejectApply.orderId);
      expect((holdAfterReject ?? []).every((h) => h.status === "released")).toBe(true);

      // --- Approve path ---
      const approveApply = await applyCommunityPaidExposurePending(sb, {
        userId,
        postId,
        productId: "community_promote_3",
        targetTitle: String(post!.title ?? ""),
        userNickname: "qa",
        idempotencyKey: `qa-approve-${randomUUID()}`,
      });
      expect(approveApply.ok).toBe(true);
      if (!approveApply.ok) return;
      const approved = await approveCommunityPaidExposure(sb, {
        orderId: approveApply.orderId,
        adminUserId: userId,
      });
      expect(approved.ok).toBe(true);
      const afterCapture = await readUserPointBalance(sb, userId);
      expect(afterCapture).toBe(before - 10000);

      const { data: order } = await sb
        .from("point_promotion_orders")
        .select("order_status, domain, product_id")
        .eq("id", approveApply.orderId)
        .maybeSingle();
      expect(order?.order_status).toBe("active");
      expect(order?.domain).toBe("community");

      const home = await fetchActiveCommunityPaidExposureFeedPosts(sb, { topicFilter: "" });
      expect(home.ok).toBe(true);
      if (home.ok) {
        expect(home.ads.some((a) => a.postId === postId)).toBe(true);
      }
      if (topic) {
        const same = await fetchActiveCommunityPaidExposureFeedPosts(sb, {
          topicFilter: topic,
        });
        expect(same.ok && same.ads.some((a) => a.postId === postId)).toBe(true);
        const wrong = await fetchActiveCommunityPaidExposureFeedPosts(sb, {
          topicFilter: `__wrong_topic_${randomUUID().slice(0, 8)}`,
        });
        expect(wrong.ok && wrong.ads.every((a) => a.postId !== postId)).toBe(true);
      }

      // cleanup entitlement so feed is not polluted long-term
      await sb
        .from("point_promotion_orders")
        .update({ order_status: "ended", end_at: new Date().toISOString() })
        .eq("id", approveApply.orderId);
    },
    120_000
  );
});
