import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  diffMemberBadgeCounters,
  resolveMemberBadgeCounterShadowRate,
  runMemberBadgeCountersShadow,
  type MemberBadgeLoaderB,
} from "@/lib/notifications/pipeline/member-badge-counters-shadow";

/** D2 1단계 — 쓰기 시점 카운터 비교(그림자). 화면 숫자 불변. */
const loader: MemberBadgeLoaderB = {
  generalDirect: 2,
  group: 1,
  trade: 3,
  customerOrder: 4,
  ownerOrder: 5,
  authorityTotal: 10,
};
const row = { b_general_direct: 2, b_group: 1, b_trade: 3, b_customer_order: 4, b_owner_order: 5, version: 7 };

describe("D2 shadow — 카운터 대조", () => {
  it("같으면 match, L 회원 합(gd+group+trade+customer)=A 면 갈림 없음", () => {
    const d = diffMemberBadgeCounters(loader, row);
    expect(d.match).toBe(true);
    expect(d.loaderVsAuthorityDiverged).toBe(false);
  });

  it("버킷별 차이를 기록한다", () => {
    const d = diffMemberBadgeCounters(loader, { ...row, b_trade: 2, b_owner_order: 0 });
    expect(d.match).toBe(false);
    expect(d.diffs).toEqual({ trade: { loader: 3, counter: 2 }, ownerOrder: { loader: 5, counter: 0 } });
  });

  it("카운터 행이 없으면 0 으로 본다", () => {
    const zero = { ...loader, generalDirect: 0, group: 0, trade: 0, customerOrder: 0, ownerOrder: 0, authorityTotal: 0 };
    expect(diffMemberBadgeCounters(zero, null).match).toBe(true);
    expect(diffMemberBadgeCounters(loader, null).match).toBe(false);
  });

  it("L 과 A 가 갈리면(중복·격리) 표시한다", () => {
    expect(diffMemberBadgeCounters({ ...loader, authorityTotal: 9 }, row).loaderVsAuthorityDiverged).toBe(true);
  });

  it("비율: 기본 10%, 환경값 0~1 만 허용", () => {
    expect(resolveMemberBadgeCounterShadowRate({} as NodeJS.ProcessEnv)).toBe(0.1);
    expect(resolveMemberBadgeCounterShadowRate({ SAMARKET_BADGE_COUNTER_SHADOW_RATE: "0" } as NodeJS.ProcessEnv)).toBe(0);
    expect(resolveMemberBadgeCounterShadowRate({ SAMARKET_BADGE_COUNTER_SHADOW_RATE: "2" } as NodeJS.ProcessEnv)).toBe(0.1);
  });

  it("표본 밖이면 DB 를 부르지 않는다, 표본이면 RPC 1건", async () => {
    const rpc = vi.fn(async () => ({ data: [row], error: null }));
    const sb = { rpc } as never;
    expect(await runMemberBadgeCountersShadow(sb, "user-1", loader, { rate: 0.1, random: () => 0.5 })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    const d = await runMemberBadgeCountersShadow(sb, "user-1", loader, { rate: 0.1, random: () => 0.01 });
    expect(rpc).toHaveBeenCalledWith("get_member_badge_counters", { p_user_id: "user-1" });
    expect(d?.match).toBe(true);
  });

  it("마이그레이션 전(RPC 오류)·예외는 조용히 건너뛴다", async () => {
    const err = { rpc: async () => ({ data: null, error: { message: "function does not exist" } }) } as never;
    expect(await runMemberBadgeCountersShadow(err, "u", loader, { rate: 1 })).toBeNull();
    const boom = { rpc: async () => { throw new Error("x"); } } as never;
    expect(await runMemberBadgeCountersShadow(boom, "u", loader, { rate: 1 })).toBeNull();
  });

  it("빌더는 반환값을 바꾸지 않고 기다리지 않는다(void 호출)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"),
      "utf8"
    );
    expect(src).toContain("keepAliveAfterResponse(runMemberBadgeCountersShadow(sb, uid, {");
    expect(src).not.toMatch(/await runMemberBadgeCountersShadow/);
  });

  it("마이그레이션: 다시 세기 방식 · WHEN 전환만 · JS trim 공백 집합(이스케이프) · service_role 전용", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20271119150000_member_badge_counters_shadow.sql"),
      "utf8"
    );
    expect(sql).toContain("internal.recompute_member_badge_counters");
    expect(sql).toContain("is distinct from (coalesce(new.unread_count, 0) > 0 and new.left_at is null)");
    expect(sql).toContain("\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff");
    expect(sql).toContain("e.chat_domain = 'store_order'");
    expect(sql).toContain("grant execute on function public.get_member_badge_counters(uuid) to service_role;");
    const regexLine = sql.split("\n").find((l) => l.includes("p ~ '[^")) ?? "";
    expect(/^[\x20-\x7e]+$/.test(regexLine)).toBe(true);
  });

  it("불일치면 2초 뒤 다시 계산해 판정을 남긴다 — 다시 같으면 timing, 계속 다르면 definition", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = [
      { ...row, b_customer_order: 3 },
      { ...row, b_customer_order: 3 },
    ];
    let i = 0;
    const sb = { rpc: async () => ({ data: [rows[Math.min(i++, 1)]], error: null }) } as never;
    await runMemberBadgeCountersShadow(sb, "u-timing", loader, {
      rate: 1,
      sleep: async () => {},
      recheckLoader: async () => ({ ...loader }),
    });
    expect(warn.mock.calls.at(-1)?.[1]).toMatchObject({ recheck: { verdict: "definition" } });

    i = 0;
    const rowsT = [{ ...row, b_customer_order: 3 }, { ...row }];
    const sbT = { rpc: async () => ({ data: [rowsT[Math.min(i++, 1)]], error: null }) } as never;
    await runMemberBadgeCountersShadow(sbT, "u-timing", loader, {
      rate: 1,
      sleep: async () => {},
      recheckLoader: async () => ({ ...loader }),
    });
    expect(warn.mock.calls.at(-1)?.[1]).toMatchObject({ recheck: { match: true, verdict: "timing" } });
    warn.mockRestore();
  });
});
