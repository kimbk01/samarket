/**
 * Owner 2026-10-28 §7 G · §8 Q1 — 찾기 「비슷한 물품」 + 판매완료 맨 끝 (마이그레이션 20270706120000).
 * 운영 DB 실데이터 대조(2026-10-28, 임시 함수): 182건 누락 0 · 중복 0, 판매중 전부 → 판매완료 전부.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tradeListSectionLabel } from "@/components/trade/TradeListSectionDivider";

const SQL = readFileSync("supabase/migrations/20270706120000_trade_list_related_sold_last.sql", "utf8");

describe("trade_list_page 2차 — 판매완료 맨 끝 · 비슷한 물품", () => {
  it("거래 상태가 정렬·커서 비교의 맨 앞, 커서 자리 순서는 그대로(길이 9)", () => {
    expect(SQL).toContain("ORDER BY r.t_state, r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_loc, r.s1, r.s2, r.pid::text");
    expect(SQL).toContain("OR (r.t_state, r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_loc, r.s1, r.s2, r.pid::text)");
    expect(SQL).toContain("> ((v_cursor ->> 4)::int, (v_cursor ->> 0)::int");
    expect(SQL).toContain(
      "jsonb_build_array(r.t_q, r.t_cat, r.t_opt, r.t_price, r.t_state, r.t_loc, r.s1, r.s2, r.pid::text) AS sort_key"
    );
  });
  it("검색 단계: 일치 0 · 비슷한(맞은 단어 수 많은 순) · 같은 주제 · 나머지", () => {
    expect(SQL).toContain("WHEN b.q_hits > 0 THEN v_nw - b.q_hits");
    expect(SQL).toContain("WHEN r.t_q < v_nw THEN 'q:related'");
  });
  it("안내 줄: q:related 문구, 판매완료 조각이 앞에 와도 읽힌다", () => {
    const t = (k: string, v?: Record<string, string | number>) => `${k}${v?.q ? `(${v.q})` : ""}`;
    expect(tradeListSectionLabel("q:related", t as never, "iphone")).toBe("trade_list_section_q_related(iphone)");
    expect(tradeListSectionLabel("state:sold|q:rest", t as never, "x")).toBe(
      "trade_list_section_state_sold · trade_list_section_q_rest(x)"
    );
  });
});
