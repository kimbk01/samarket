/**
 * 광고 DB 묶음 A-DB (2026-11-27) — 연장 기록 분리(TB-07) · 커뮤니티 가격 버전(TB-11) · 만료 알림(TB-09)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendUserNotification = vi.fn(async () => true);
vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: (...a: unknown[]) => appendUserNotification(...(a as [])),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: async () => "ko",
}));

import {
  isDailyPromotionNoticeWindow,
  runPromotionExpiryNoticeBatch,
} from "@/lib/ads/promotion-expiry-notify";

const MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20271127100000_ad_db_a_promotion_extensions.sql"),
  "utf8"
);
const ROLLBACK = readFileSync(join(process.cwd(), "docs/audit/ad-db-a-rollback-2026-11-27.sql"), "utf8");

describe("A-DB 마이그레이션 (TB-07·TB-11)", () => {
  it("연장 기록 표를 만들고, 결제 함수 3개를 바꿀 문장만 정확히 1번 바꾼다(5곳)", () => {
    expect(MIG).toContain("CREATE TABLE IF NOT EXISTS public.point_promotion_order_extensions");
    expect(MIG.match(/SELECT public\._ads_adb_a_replace_once\(/g)?.length).toBe(5);
    expect(MIG).toContain("바꿀 문장이 정확히 1번 있어야 함");
    expect(MIG).toContain("DROP FUNCTION public._ads_adb_a_replace_once");
  });
  it("바뀐 연장 분기는 주문 행 금액·기간을 더하지 않고 종료일만 늘린다", () => {
    const newBlocks = [...MIG.matchAll(/\$new\$([\s\S]*?)\$new\$/g)].map((m) => m[1]);
    expect(newBlocks).toHaveLength(5);
    for (const b of newBlocks) {
      expect(b).not.toContain("duration_days = duration_days + p_duration_days");
      expect(b).not.toContain("point_cost = point_cost + p_point_cost");
    }
    expect(newBlocks.filter((b) => b.includes("INSERT INTO public.point_promotion_order_extensions"))).toHaveLength(2);
  });
  it("커뮤니티 새 주문이 가격 버전을 기록한다(TB-11)", () => {
    expect(MIG).toContain("product_id, domain, idempotency_key, product_revision -- TB-11");
    expect(MIG).toContain("v_product.revision -- TB-11 값");
  });
  it("되돌리기 SQL 이 같은 5곳을 역순으로 되돌리고 표를 지운다", () => {
    expect(ROLLBACK.match(/SELECT public\._ads_adb_a_revert_once\(/g)?.length).toBe(5);
    expect(ROLLBACK).toContain("DROP TABLE IF EXISTS public.point_promotion_order_extensions");
  });
});

describe("TB-09 만료 알림", () => {
  beforeEach(() => appendUserNotification.mockClear());

  it("하루 1회 창 = 01:00~01:09 UTC (09:00 PHT)", () => {
    expect(isDailyPromotionNoticeWindow(Date.parse("2026-11-27T01:05:00Z"))).toBe(true);
    expect(isDailyPromotionNoticeWindow(Date.parse("2026-11-27T01:10:00Z"))).toBe(false);
    expect(isDailyPromotionNoticeWindow(Date.parse("2026-11-27T09:05:00Z"))).toBe(false);
  });

  it("곧 끝남·끝남 주문마다 알림 1건 · 주문당 중복 방지 키 · 내 광고로", async () => {
    const rowsByStatus: Record<string, unknown[]> = {
      active: [{ id: "o-1", user_id: "u-1", target_title: "자전거", end_at: "2026-11-28T00:00:00Z" }],
      expired: [{ id: "o-2", user_id: "u-2", target_title: "", end_at: "2026-11-26T20:00:00Z" }],
    };
    const sb = {
      from: () => {
        let status = "";
        const q = {
          select: () => q,
          eq: (col: string, v: string) => {
            if (col === "order_status") status = v;
            return q;
          },
          gt: () => q,
          lte: () => q,
          gte: () => q,
          limit: async () => ({ data: rowsByStatus[status] ?? [], error: null }),
        };
        return q;
      },
    };
    const res = await runPromotionExpiryNoticeBatch(sb as never, "trade", Date.parse("2026-11-27T01:00:00Z"));
    expect(res).toEqual({ ok: true, soon: 1, ended: 1 });
    const calls = appendUserNotification.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);
    expect(calls.map((c) => c.dedupe_key)).toEqual(["promotion-soon:o-1", "promotion-ended:o-2"]);
    expect(calls.every((c) => c.link_url === "/mypage/ads" && c.push_kind === "trade")).toBe(true);
    expect(String(calls[1]?.body)).toContain("(제목 없는 글)");
  });
});
