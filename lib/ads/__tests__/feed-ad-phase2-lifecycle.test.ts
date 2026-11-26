/**
 * PHASE 2 contract tests M1–M11 (destination + cancel + view href).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedAdMemberViewHref,
  normalizeFeedAdDestination,
  isFeedAdDestinationNone,
} from "@/lib/ads/feed-ad-destination";
import { cancelFeedAdRequest } from "@/lib/ads/cancel-feed-ad-request";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true })),
  creditUserPoints: vi.fn(async () => ({ ok: true })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

type Row = Record<string, unknown>;

/** B-DB R-24: 회원 취소는 DB 함수 1회 — 함수 계약(검토 중·본인만 · 보류 해제 + cancelled · 두 번째는 not_pending)을 흉내 */
function makeCancelRpcDb(state: { requests: Row[]; holds: Row[]; credits: number }) {
  return {
    rpc: async (fn: string, args: Row) => {
      if (fn !== "member_cancel_feed_ad_request") return { data: null, error: { message: "unknown_fn" } };
      const req = state.requests.find((r) => r.id === args.p_request);
      if (!req) return { data: { ok: false, error: "not_found" }, error: null };
      if (req.user_id !== args.p_user) return { data: { ok: false, error: "forbidden" }, error: null };
      if (req.status !== "pending_review") return { data: { ok: false, error: "not_pending" }, error: null };
      let released = 0;
      for (const h of state.holds) {
        if (h.request_id === req.id && h.status === "held") {
          h.status = "released";
          released += Number(h.amount ?? 0);
          state.credits += 1;
        }
      }
      req.status = "cancelled";
      return { data: { ok: true, status: "cancelled", released_points: released }, error: null };
    },
  } as unknown as SupabaseClient;
}

describe("PHASE 2 destination contract (M7–M10)", () => {
  it("M7 internal path", () => {
    const r = normalizeFeedAdDestination({
      destinationType: "internal_page",
      destinationUrl: "/market",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.destinationType).toBe("internal_page");
      expect(r.value.destinationUrl).toBe("/market");
    }
  });

  it("M8 external https", () => {
    const r = normalizeFeedAdDestination({
      destinationType: "external_url",
      destinationUrl: "https://example.com/x",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.destinationType).toBe("external_url");
      expect(r.value.destinationUrl).toContain("https://example.com");
    }
  });

  it("M9 invalid scheme rejected", () => {
    expect(
      normalizeFeedAdDestination({
        destinationType: "external_url",
        destinationUrl: "javascript:alert(1)",
      }).ok
    ).toBe(false);
    expect(
      normalizeFeedAdDestination({
        destinationType: "external_url",
        destinationUrl: "data:text/html,hi",
      }).ok
    ).toBe(false);
    expect(
      normalizeFeedAdDestination({
        destinationType: "external_url",
        destinationUrl: "file:///etc/passwd",
      }).ok
    ).toBe(false);
  });

  it("M10 → DS-3 · C-1 (2026-11-04): 목적지 「없음」은 거부한다", () => {
    expect(normalizeFeedAdDestination({ destinationType: "none" })).toEqual({ ok: false, error: "destination_required" });
    expect(normalizeFeedAdDestination({ destinationType: "internal_page", destinationUrl: "" })).toEqual({
      ok: false,
      error: "destination_required",
    });
    expect(normalizeFeedAdDestination({ destinationType: "" })).toEqual({ ok: false, error: "destination_required" });
    // 예전 「없음」 행 판정 함수는 노출 단계 정리용으로 남는다
    expect(isFeedAdDestinationNone({ destinationType: "internal_page", destinationId: "", destinationUrl: "" })).toBe(true);
  });
});

describe("PHASE 2 member view href (M11)", () => {
  it("maps placements to existing web routes", () => {
    expect(feedAdMemberViewHref({ placement: "TRADE_HOME" })).toBe("/market");
    expect(
      feedAdMemberViewHref({ placement: "TRADE_CATEGORY", targetCategoryId: "cat-1" })
    ).toBe("/market?category=cat-1");
    expect(feedAdMemberViewHref({ placement: "COMMUNITY_HOME" })).toBe("/philife");
    expect(
      feedAdMemberViewHref({ placement: "COMMUNITY_TOPIC", targetTopicSlug: "news" })
    ).toBe("/philife?category=news");
  });
});

describe("PHASE 2 member cancel (M2) — B-DB 한 트랜잭션 함수", () => {
  it("pending cancel → 보류 해제 + cancelled · 두 번째 취소는 not_pending(중복 환급 없음) · 함수 1회 호출", async () => {
    const state = {
      requests: [{ id: "req-1", user_id: "user-1", status: "pending_review" }] as Row[],
      holds: [{ id: "hold-1", user_id: "user-1", request_id: "req-1", amount: 100, status: "held" }] as Row[],
      credits: 0,
    };
    const sb = makeCancelRpcDb(state);

    const first = await cancelFeedAdRequest(sb, { requestId: "req-1", userId: "user-1" });
    expect(first).toEqual({ ok: true, status: "cancelled", releasedPoints: 100 });
    expect(state.requests[0]?.status).toBe("cancelled");
    expect(state.holds[0]?.status).toBe("released");
    expect(state.credits).toBe(1);

    const second = await cancelFeedAdRequest(sb, { requestId: "req-1", userId: "user-1" });
    expect(second).toMatchObject({ ok: false, error: "not_pending", httpStatus: 409 });
    expect(state.credits).toBe(1);
  });

  it("남의 신청은 403 · 없는 신청은 404 · 함수 오류는 500", async () => {
    const state = { requests: [{ id: "req-2", user_id: "owner", status: "pending_review" }] as Row[], holds: [] as Row[], credits: 0 };
    const sb = makeCancelRpcDb(state);
    expect(await cancelFeedAdRequest(sb, { requestId: "req-2", userId: "other" })).toMatchObject({ error: "forbidden", httpStatus: 403 });
    expect(await cancelFeedAdRequest(sb, { requestId: "nope", userId: "owner" })).toMatchObject({ error: "not_found", httpStatus: 404 });
    const broken = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as unknown as SupabaseClient;
    expect(await cancelFeedAdRequest(broken, { requestId: "req-2", userId: "owner" })).toMatchObject({ error: "cancel_failed", httpStatus: 500 });
  });
});

describe("PHASE 2 authority markers (M5)", () => {
  it("admin approve route imports approveFeedAdRequest only once as writer", async () => {
    const src = await import("@/lib/ads/approve-feed-ad-request");
    expect(typeof src.approveFeedAdRequest).toBe("function");
  });

  it("M5 admin PATCH approve uses PHASE1 writer (공용 runFeedAdAdminAction 경유); no inline capture", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/admin/feed-ad-requests/[id]/route.ts"), "utf8");
    const shared = fs.readFileSync(
      path.join(process.cwd(), "lib/admin/advertising-workspace/feed-ad-admin-actions.ts"),
      "utf8"
    );
    // 설계 FB-A07 (2026-11-04): 공통·도메인 화면이 같은 함수 하나로 승인한다
    expect(route).toContain("runFeedAdAdminAction(sb");
    expect(shared).toContain('import { approveFeedAdRequest }');
    expect(shared).toContain("approveFeedAdRequest(sb");
    expect(route).not.toContain("captureHeldPointsForFeedAdRequest");
    expect(shared).not.toContain("captureHeldPointsForFeedAdRequest");
  });

  it("M6 reject releases held points atomically via admin_reject_feed_ad_request (V3-02)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "app/api/admin/feed-ad-requests/[id]/route.ts"
    );
    const text = fs.readFileSync(file, "utf8");
    // H-2: 도메인 화면과 광고 허브가 같은 단일 구현을 부른다
    const shared = fs.readFileSync(path.join(process.cwd(), "lib/ads/admin-reject-feed-ad-request.ts"), "utf8");
    expect(shared).toContain('sb.rpc("admin_reject_feed_ad_request"');
    expect(shared).not.toContain("releaseHeldPointsForFeedAdRequest");
    expect(text).toContain("adminRejectFeedAdRequest(sb, req");
    expect(text).not.toContain("releaseHeldPointsForFeedAdRequest");
    expect(text).toContain("reason_required");
    const hub = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/advertising-workspace/action/route.ts"),
      "utf8"
    );
    expect(hub).toContain("adminRejectFeedAdRequest(sb, req");
    expect(hub).not.toContain("releaseHeldPointsForFeedAdRequest");
    expect(hub).not.toMatch(/from\("feed_ad_requests"\)\s*\.update/);
  });

  it("M4 replace_creative rejects blob URLs", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "app/api/admin/feed-ad-requests/[id]/route.ts"
    );
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("persisted_url_required");
    expect(text).toContain('startsWith("blob:")');
    expect(text).toContain("replace_creative");
  });

  it("M1/M3 member POST + admin GET persist request creatives", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const memberPost = fs.readFileSync(
      path.join(process.cwd(), "app/api/me/feed-ad-requests/route.ts"),
      "utf8"
    );
    const adminGet = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/feed-ad-requests/[id]/route.ts"),
      "utf8"
    );
    expect(memberPost).toContain("feed_ad_request_creatives");
    expect(memberPost).toContain("image_url: c.imageUrl");
    expect(memberPost).toContain("creatives_max_three");
    expect(memberPost).not.toContain("creativesRaw.slice(0, 1)");
    expect(adminGet).toContain("creativeAuthority");
    expect(adminGet).toContain("feed_ad_request_creatives");
  });
});
