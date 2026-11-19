import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMemberBadgeCounterShadowRate } from "@/lib/notifications/pipeline/badge-shadow-rate";
import {
  purgeRoomUnreadIdempotency,
  ROOM_UNREAD_IDEMPOTENCY_KEEP_DAYS,
} from "@/lib/community-messenger/server/purge-room-unread-idempotency";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("재감사 C — member_badge_counters 그림자 퇴역", () => {
  it("배지 계산은 더 이상 카운터 표를 부르지 않는다", () => {
    const src = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(src).not.toContain("runMemberBadgeCountersShadow");
    expect(src).not.toContain("get_member_badge_counters");
    expect(src).not.toContain("member-badge-counters-shadow");
    expect(existsSync(join(process.cwd(), "lib/notifications/pipeline/member-badge-counters-shadow.ts"))).toBe(false);
  });

  it("탭↔아이콘 갈림 감시는 DB 호출 없이 표본으로 남는다", () => {
    const src = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(src).toContain("[badge-loader-authority-diverged]");
  });

  it("남은 그림자 비율: 기본 10%, 환경값 0~1 만 허용", () => {
    expect(resolveMemberBadgeCounterShadowRate({} as NodeJS.ProcessEnv)).toBe(0.1);
    expect(resolveMemberBadgeCounterShadowRate({ SAMARKET_BADGE_COUNTER_SHADOW_RATE: "0" } as NodeJS.ProcessEnv)).toBe(0);
    expect(resolveMemberBadgeCounterShadowRate({ SAMARKET_BADGE_COUNTER_SHADOW_RATE: "2" } as NodeJS.ProcessEnv)).toBe(0.1);
  });

  it("마이그레이션: 트리거·함수·표를 지우고 입력 표가 쓰는 공용 함수는 남긴다", () => {
    const sql = read("supabase/migrations/20271119230000_retire_member_badge_counters_shadow.sql");
    for (const t of [
      "trg_member_badge_counters_participants_ins",
      "trg_member_badge_counters_participants_upd",
      "trg_member_badge_counters_participants_del",
      "trg_member_badge_counters_rooms",
    ]) {
      expect(sql).toContain(`drop trigger if exists ${t}`);
    }
    expect(sql).toContain("drop function if exists public.get_member_badge_counters(uuid);");
    expect(sql).toContain("drop function if exists internal.recompute_member_badge_counters(uuid);");
    expect(sql).toContain("drop table if exists public.member_badge_counters;");
    expect(sql).not.toMatch(/drop function[^;]*cm_badge_text_has_content/);
    expect(read("supabase/migrations/20271119200000_member_unread_room_inputs.sql")).toContain(
      "internal.cm_badge_text_has_content"
    );
  });
});

describe("재감사 D — 중복 방지 기록 7일 보존", () => {
  it("RPC 1건으로 지운 수를 돌려준다", async () => {
    const calls: unknown[] = [];
    const sb = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: 42, error: null };
      },
    } as never;
    expect(await purgeRoomUnreadIdempotency(sb)).toEqual({ ok: true, deleted: 42 });
    expect(calls).toEqual([["dibay_purge_room_unread_idempotency", { p_keep_days: ROOM_UNREAD_IDEMPOTENCY_KEEP_DAYS }]]);
    expect(ROOM_UNREAD_IDEMPOTENCY_KEEP_DAYS).toBe(7);
  });

  it("함수가 없거나 예외여도 던지지 않는다", async () => {
    const err = { rpc: async () => ({ data: null, error: { message: "function does not exist" } }) } as never;
    expect(await purgeRoomUnreadIdempotency(err)).toEqual({ ok: false, error: "function does not exist" });
    const boom = { rpc: async () => { throw new Error("x"); } } as never;
    expect(await purgeRoomUnreadIdempotency(boom)).toEqual({ ok: false, error: "x" });
  });

  it("매일 메신저 정리 작업이 연락처 정리 전에 1번 부른다", () => {
    const src = read("app/api/cron/messenger-contacts-maintenance/route.ts");
    const purge = src.indexOf("await purgeRoomUnreadIdempotency(sb)");
    const settings = src.indexOf("await readContactsAdminSettings(sb)");
    expect(purge).toBeGreaterThan(0);
    expect(purge).toBeLessThan(settings);
  });

  it("마이그레이션: service_role 전용 · 상한 · 보존일 하한", () => {
    const sql = read("supabase/migrations/20271119231000_dibay_room_unread_idempotency_retention.sql");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("greatest(coalesce(p_keep_days, 7), 1)");
    expect(sql).toContain("limit v_max");
    expect(sql).toContain("from public, anon, authenticated;");
    expect(sql).toContain("to service_role;");
  });
});
