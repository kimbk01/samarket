import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  tradeSoldVisibleOrFilter,
  tradeSoldVisibleSinceIso,
} from "@/lib/trade/marketplace/sold-visible-window.server";
import {
  TRADE_SOLD_VISIBLE_DAYS_DEFAULT,
  TRADE_SOLD_VISIBLE_DAYS_MAX,
  mergeTradeDetailOpsSettings,
} from "@/services/trade/trade-settings.service";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const SQL = read("supabase/migrations/20271103160000_trade_sold_visible_window.sql");

describe("판매완료 목록 노출 기간 — 설정 (Owner 2026-11-03 「1달 · 어드민 조정」)", () => {
  it("기본 30일 · 1~90일 · revision", () => {
    expect(TRADE_SOLD_VISIBLE_DAYS_DEFAULT).toBe(30);
    expect(mergeTradeDetailOpsSettings({}).completedVisibleDays).toBe(30);
    expect(mergeTradeDetailOpsSettings({ completedVisibleDays: 500 }).completedVisibleDays).toBe(TRADE_SOLD_VISIBLE_DAYS_MAX);
    expect(mergeTradeDetailOpsSettings({ completedVisibleDays: 0 }).completedVisibleDays).toBe(1);
    expect(mergeTradeDetailOpsSettings({}).revision).toBe(0);
    expect(mergeTradeDetailOpsSettings({ revision: 4 }).revision).toBe(4);
  });

  it("기준 시각 = 지금 − N일 · 구간 조회 조건 = 판매완료 아님 또는 기간 안 판매완료", () => {
    const now = Date.parse("2026-11-03T05:00:00.000Z");
    expect(tradeSoldVisibleSinceIso(30, now)).toBe("2026-10-04T05:00:00.000Z");
    expect(tradeSoldVisibleOrFilter("2026-10-04T05:00:00.000Z")).toBe(
      "status.is.null,status.neq.sold,sold_at.gte.2026-10-04T05:00:00.000Z"
    );
  });
});

describe("DB — sold_at · 트리거 · 목록 함수", () => {
  it("최종 상태 기준(노출 트리거 다음) · 비어 있을 때만 기록 · 숨김은 유지 · 진짜 되돌림만 비움", () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS sold_at/);
    expect(SQL).toMatch(/CREATE TRIGGER trg_posts_z_sold_at\s+BEFORE INSERT OR UPDATE ON public\.posts/);
    expect("trg_posts_z_sold_at" > "trg_posts_visibility_gate").toBe(true);
    expect(SQL).toMatch(/ELSIF NEW\.status IS DISTINCT FROM 'hidden' THEN\s+NEW\.sold_at := NULL/);
  });
  it("기존 판매완료만 채우고 이미 있는 값은 덮지 않는다", () => {
    expect(SQL).toMatch(/WHERE status = 'sold' AND sold_at IS NULL/);
  });
  it("목록 함수: sold_days(없으면 30) 동안만 판매완료 포함", () => {
    expect(SQL).toMatch(/coalesce\(nullif\(p ->> 'sold_days', ''\)::int, 30\)/);
    expect(SQL).toMatch(/po\.status IS DISTINCT FROM 'sold' OR coalesce\(po\.sold_at, po\.updated_at, po\.created_at\) >= v_sold_since/);
  });
});

describe("앱 — 어디에 적용되나", () => {
  it("거래 목록·찾기 = 목록 함수에 어드민 기간 전달", () => {
    const s = read("lib/trade/marketplace/list-contract/trade-list-page.server.ts");
    expect(s).toContain("sold_days: soldWindow.days");
  });
  it("카테고리 목록(구간 조회)·범위 조회 = sold_at 칸이 있을 때만 같은 조건", () => {
    for (const f of ["lib/posts/home-posts-query-server.ts", "lib/posts/trade-posts-range-query.ts"]) {
      const s = read(f);
      expect(s).toContain("if (soldWindow.soldAtReady)");
      expect(s).toContain("tradeSoldVisibleOrFilter(soldWindow.sinceIso)");
    }
  });
  it("상세 관련 글 = 판매완료 시각 기준(없으면 마지막 수정)", () => {
    expect(read("services/trade/trade-related.service.ts")).toContain("const timeText = soldAt ?? row.updated_at");
  });
  it("어드민 저장 = revision 조건부 저장 · 충돌 409 · 변경 내역", () => {
    const api = read("app/api/admin/trade/settings/route.ts");
    expect(api).toContain('error: "revision_conflict"');
    expect(api).toContain('filter("value_json->>revision", "eq"');
    expect(api).toContain("invalidateTradeSoldVisibleWindowCache()");
    const page = read("components/admin/trade/AdminTradeSettingsPage.tsx");
    expect(page).toContain("admin_trade_settings_sold_visible_days");
    expect(page).toContain("data-trade-settings-history");
  });
  it("새 문구는 adminMessages 밖 별도 카탈로그 (TS7056)", () => {
    expect(read("lib/i18n/catalog/admin-trade.ts")).not.toContain("admin_trade_settings_sold_visible_days");
    expect(read("lib/i18n/message-key.ts")).toContain("adminTradeSoldWindowMessages");
  });
});
