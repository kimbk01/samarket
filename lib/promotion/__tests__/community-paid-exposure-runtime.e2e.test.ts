/**
 * Runtime proof (service role) — Community A2 immediate active + TOP feed.
 * Run: RUN_REVENUE_E2E=1 npx vitest run lib/promotion/__tests__/community-paid-exposure-runtime.e2e.test.ts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCommunityPaidExposureImmediate } from "@/lib/promotion/apply-community-paid-exposure";
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

describe.runIf(RUN)("community paid exposure runtime E2E (A2 immediate)", () => {
  it(
    "immediate spend + active + feed TOP; no pending_review",
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

      // Clear conflicting active/pending for this post so QA can re-run.
      await sb
        .from("point_promotion_orders")
        .update({ order_status: "ended", end_at: new Date(0).toISOString() })
        .eq("target_id", postId)
        .eq("domain", "community")
        .in("order_status", ["pending_review", "active"]);

      const creditId = `qa-community-promo-a2:${randomUUID()}`;
      const credited = await creditUserPoints(sb, {
        userId,
        amount: 10000,
        entryType: "admin_credit",
        relatedType: "admin_manual",
        relatedId: creditId,
        description: "QA community A2 immediate (temporary)",
        actorType: "admin",
      });
      expect(credited.ok).toBe(true);
      const before = await readUserPointBalance(sb, userId);
      expect(before).toBeGreaterThanOrEqual(10000);

      const applied = await applyCommunityPaidExposureImmediate(sb, {
        userId,
        postId,
        productId: "community_promote_3",
        targetTitle: String(post!.title ?? ""),
        userNickname: "qa",
        idempotencyKey: `qa-a2-${randomUUID()}`,
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(applied.status).toBe("active");

      const after = await readUserPointBalance(sb, userId);
      expect(after).toBe(before - 10000);

      const { data: order } = await sb
        .from("point_promotion_orders")
        .select("order_status, domain, product_id, target_type")
        .eq("id", applied.orderId)
        .maybeSingle();
      expect(order?.order_status).toBe("active");
      expect(order?.domain).toBe("community");
      expect(order?.target_type).toBe("community_post");

      const { data: holds } = await sb
        .from("promotion_point_holds")
        .select("id")
        .eq("promotion_order_id", applied.orderId);
      expect((holds ?? []).length).toBe(0);

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
      }

      await sb
        .from("point_promotion_orders")
        .update({ order_status: "ended", end_at: new Date(0).toISOString() })
        .eq("id", applied.orderId);
    },
    120_000
  );
});
