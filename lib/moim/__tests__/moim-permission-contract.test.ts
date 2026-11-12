import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOIM_ACTIONS,
  MOIM_PERMISSION_DEFAULTS,
  canMoimAction,
  isAllowedMoimPermissionOverride,
  moimRoleToMessengerRole,
  type MoimPermissionContext,
} from "@/lib/moim/moim-permission-contract";
import { MOIM_ERROR_CODES, toMoimErrorCode } from "@/lib/moim/moim-error-codes";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20271112210000_moim_m2_schema_rpc.sql"),
  "utf8"
);
/** 모임 RPC 마이그레이션 전부 (오류 코드 대조용) */
const ALL_MOIM_SQL = readdirSync(join(process.cwd(), "supabase/migrations"))
  .filter((f) => /_moim_/.test(f) && !f.includes("drop_legacy"))
  .map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"))
  .join("\n");

function sqlPermissionRows(): Map<string, { min: string; adjustable: boolean; floor: string }> {
  const start = MIGRATION.indexOf("create or replace function public.moim_permission_defaults()");
  const block = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  const rows = new Map<string, { min: string; adjustable: boolean; floor: string }>();
  for (const m of block.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*(true|false),\s*'([a-z_]+)'\)/g)) {
    rows.set(m[1], { min: m[2], adjustable: m[3] === "true", floor: m[4] });
  }
  return rows;
}

const active = (viewerRole: MoimPermissionContext["viewerRole"], extra?: Partial<MoimPermissionContext>): MoimPermissionContext => ({
  moimStatus: "active",
  platformState: "normal",
  viewerRole,
  ...extra,
});

describe("moim permission contract — TS 표 = SQL moim_permission_defaults()", () => {
  it("모든 행동이 같은 기본값·조정 여부·하한을 가진다", () => {
    const sql = sqlPermissionRows();
    expect([...sql.keys()].sort()).toEqual([...MOIM_ACTIONS].sort());
    for (const action of MOIM_ACTIONS) {
      const ts = MOIM_PERMISSION_DEFAULTS[action];
      expect(sql.get(action), action).toEqual({ min: ts.defaultMinRole, adjustable: ts.adjustable, floor: ts.floorRole });
    }
  });

  it("설계 §5.2 기본값: 일정 만들기는 멤버 누구나, 내보내기는 부모임장부터, 정보 수정·역할·위임·종료는 모임장만", () => {
    expect(canMoimAction(active("member"), "create_schedule")).toBe(true);
    expect(canMoimAction(active("staff"), "remove_member")).toBe(false);
    expect(canMoimAction(active("co_host"), "remove_member")).toBe(true);
    for (const action of ["edit_info", "set_role", "transfer_host", "close"] as const) {
      expect(canMoimAction(active("co_host"), action)).toBe(false);
      expect(canMoimAction(active("host"), action)).toBe(true);
    }
  });

  it("조정: 하한 아래로 못 내리고, 조정 불가 행동은 무시된다", () => {
    expect(isAllowedMoimPermissionOverride("remove_member", "staff")).toBe(true);
    expect(isAllowedMoimPermissionOverride("remove_member", "member")).toBe(false);
    expect(isAllowedMoimPermissionOverride("edit_info", "co_host")).toBe(false);
    expect(canMoimAction(active("staff", { overrides: { remove_member: "staff" } }), "remove_member")).toBe(true);
    expect(canMoimAction(active("co_host", { overrides: { edit_info: "co_host" } }), "edit_info")).toBe(false);
  });

  it("차단 모임은 종료 외 전부 불가, 경고 모임은 위임 불가, 종료된 모임·비멤버는 불가", () => {
    expect(canMoimAction(active("host", { platformState: "blocked" }), "edit_info")).toBe(false);
    expect(canMoimAction(active("host", { platformState: "blocked" }), "close")).toBe(true);
    expect(canMoimAction(active("host", { platformState: "warned" }), "transfer_host")).toBe(false);
    expect(canMoimAction(active("host", { moimStatus: "closed" }), "close")).toBe(false);
    expect(canMoimAction(active(null), "send_invite")).toBe(false);
  });

  it("메신저 방 역할 매핑 = SQL moim__cm_role", () => {
    expect(moimRoleToMessengerRole("host")).toBe("owner");
    expect(moimRoleToMessengerRole("co_host")).toBe("admin");
    expect(moimRoleToMessengerRole("staff")).toBe("member");
    expect(moimRoleToMessengerRole("member")).toBe("member");
    expect(MIGRATION).toContain("select case p_role when 'host' then 'owner' when 'co_host' then 'admin' else 'member' end;");
  });
});

describe("moim error codes — TS 목록 = SQL 이 내는 코드", () => {
  it("SQL 의 moim__fail / raise 코드가 모두 TS 목록에 있다", () => {
    const failCodes = new Set<string>();
    for (const m of ALL_MOIM_SQL.matchAll(/moim__fail\('([a-z_]+)'\)/g)) failCodes.add(m[1]);
    for (const m of ALL_MOIM_SQL.matchAll(/raise exception '(moim_[a-z_]+)'/g)) failCodes.add(m[1]);
    for (const m of ALL_MOIM_SQL.matchAll(/'error', '(moim_[a-z_]+)'/g)) failCodes.add(m[1]);
    expect([...failCodes].sort()).toEqual([...MOIM_ERROR_CODES].sort());
  });

  it("오류 메시지에서 코드를 꺼낸다", () => {
    expect(toMoimErrorCode("P0001: moim_full")).toBe("moim_full");
    expect(toMoimErrorCode("moim_something_new")).toBe("moim_unknown");
    expect(toMoimErrorCode(undefined)).toBe("moim_unknown");
  });
});

describe("moim migration invariants", () => {
  it("모든 모임 테이블이 RLS 잠금 목록에 있다", () => {
    const created = [...MIGRATION.matchAll(/create table if not exists public\.(moim[a-z_]*)/g)].map((m) => m[1]);
    const rlsBlock = MIGRATION.slice(MIGRATION.indexOf("do $rls$"), MIGRATION.indexOf("$rls$;"));
    for (const table of created) expect(rlsBlock, table).toContain(`'${table}'`);
  });

  it("메신저 보호 트리거 함수는 다른 함수를 부르지 않는다 (일반 회원 세션 실행 권한 무관)", () => {
    for (const fn of ["cm_moim_guard_participants", "cm_moim_guard_room_side_writes", "cm_moim_guard_rooms"]) {
      const start = MIGRATION.indexOf(`create or replace function public.${fn}()`);
      const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", MIGRATION.indexOf("$$", start) + 2));
      expect(body, fn).toContain("security definer");
      expect(body, fn).not.toMatch(/public\.(moim_|cm_moim_room_is_owned)/);
    }
  });

  it("모임 RPC 실행 권한은 service_role 만", () => {
    expect(MIGRATION).toContain("revoke all on function %s from public, anon, authenticated");
    expect(MIGRATION).toContain("grant execute on function %s to service_role");
  });

  it("메신저 모임 방은 탐색·초대 링크·멤버 초대가 꺼진 private_group 이다", () => {
    const start = MIGRATION.indexOf("create or replace function public.moim__room_create(");
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    expect(body).toContain("'private_group', 'active', 'private', 'invite_only'");
    expect(body).toContain("'alias_allowed', 'group', 'group:' || v_room::text, 'group:' || v_room::text, 'moim', p_ref");
  });
});
