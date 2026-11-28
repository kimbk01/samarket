import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { moimManageMessages } from "@/lib/i18n/catalog/moim-manage";
import { adminMoimMessages } from "@/lib/i18n/catalog/admin-moim";
import type { MoimBannedDto, MoimJoinRequestDto, MoimMemberDto } from "@/lib/moim/moim-api-types";

/** R3 B 묶음 (설계 docs/audit/moim-r3-screens-design-2026-11-28.md) — 내 모임 종료 모임 · 카드 배지 · 단수형 · 멤버 관리 탭 */

type Call = { table: string; method: string; args: unknown[] };

/** supabase 체인 흉내 — 모든 호출을 기록하고, 표·select 열에 따라 정해 둔 행을 돌려준다 */
function fakeSupabase(rowsFor: (table: string, select: string) => unknown[]) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    let select = "";
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "order", "limit", "gte", "gt", "lt", "maybeSingle"]) {
      c[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        if (m === "select") select = String(args[0]);
        return c;
      };
    }
    c.then = (r: (v: unknown) => unknown) => r({ data: rowsFor(table, select), error: null });
    return c;
  });
  return { sb: { from } as never, calls };
}

const moimRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `모임 ${id}`,
  intro: "",
  cover_image_url: null,
  category_id: "c1",
  topic_label: null,
  lgu_id: null,
  join_mode: "instant",
  capacity: null,
  age_min_birth_year: null,
  age_max_birth_year: null,
  host_user_id: "h",
  status: "active",
  platform_state: "normal",
  member_count: 3,
  last_activity_at: "2026-11-28T00:00:00Z",
  main_room_id: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  retention_ended_at: null,
  moim_schedules: [],
  ...over,
});

describe("U-12 내 모임 — 열람 기간 안의 종료 모임(활동 멤버만)", () => {
  it("isMyMoimListed: 운영 중 = 활동·신청 중 · 종료 = 기간 안 + 활동 멤버만", async () => {
    const { isMyMoimListed } = await import("@/lib/moim/server/moim-queries.server");
    expect(isMyMoimListed({ status: "active", retention_ended_at: null }, "active")).toBe(true);
    expect(isMyMoimListed({ status: "active", retention_ended_at: null }, "pending")).toBe(true);
    expect(isMyMoimListed({ status: "closed", retention_ended_at: null }, "active")).toBe(true);
    expect(isMyMoimListed({ status: "closed", retention_ended_at: null }, "pending")).toBe(false);
    expect(isMyMoimListed({ status: "closed", retention_ended_at: "2026-11-20T00:00:00Z" }, "active")).toBe(false);
    expect(isMyMoimListed({ status: "active", retention_ended_at: null }, null)).toBe(false);
  });

  it("listMyMoims: 한 번의 moims 조회에 종료 조건·일정 관계를 묶고, 결과는 멤버 상태로 거른다", async () => {
    const { listMyMoims } = await import("@/lib/moim/server/moim-queries.server");
    const { sb, calls } = fakeSupabase((table, select) => {
      if (table === "moim_members" && select.startsWith("moim_id, status, updated_at"))
        return [
          { moim_id: "a", status: "active" },
          { moim_id: "b", status: "active" },
          { moim_id: "c", status: "pending" },
          { moim_id: "d", status: "active" },
        ];
      if (table === "moims")
        return [
          moimRow("a", { moim_schedules: [{ id: "s1" }] }),
          moimRow("b", { status: "closed" }),
          moimRow("c", { status: "closed" }),
          moimRow("d", { status: "active" }),
        ];
      return [];
    });
    const out = await listMyMoims(sb, "u1");
    expect(out.map((m) => m.id)).toEqual(["a", "b", "d"]);
    expect(out.map((m) => m.status)).toEqual(["active", "closed", "active"]);
    expect(out.map((m) => m.hasRecruitingSchedule)).toEqual([true, false, false]);

    const moimCalls = calls.filter((c) => c.table === "moims");
    /** moims 조회 1회 — 일정은 같은 select 의 관계로 (추가 요청 0) */
    expect(moimCalls.filter((c) => c.method === "select")).toHaveLength(1);
    expect(String(moimCalls.find((c) => c.method === "select")?.args[0])).toMatch(/, moim_schedules\(id\)$/);
    expect(moimCalls.find((c) => c.method === "or")?.args[0]).toBe("status.eq.active,and(status.eq.closed,retention_ended_at.is.null)");
    expect(moimCalls.some((c) => c.method === "eq" && c.args[0] === "moim_schedules.status" && c.args[1] === "recruiting")).toBe(true);
    expect(moimCalls.some((c) => c.method === "gte" && c.args[0] === "moim_schedules.starts_at")).toBe(true);
    expect(moimCalls.some((c) => c.method === "limit" && c.args[0] === 1 && (c.args[1] as { referencedTable?: string })?.referencedTable === "moim_schedules")).toBe(
      true
    );
    /** 상태 eq("status","active") 로 종료 모임을 빼던 예전 조건이 남아 있지 않다 */
    expect(moimCalls.some((c) => c.method === "eq" && c.args[0] === "status")).toBe(false);
    expect(calls.filter((c) => c.table === "moim_schedules")).toHaveLength(0);
  });

  it("listLocalMoims 도 같은 select 안에서 일정 관계를 읽는다 (일정 표 따로 조회 없음)", async () => {
    const { listLocalMoims } = await import("@/lib/moim/server/moim-queries.server");
    const { sb, calls } = fakeSupabase((table) => (table === "moims" ? [moimRow("x", { moim_schedules: [{ id: "s" }] }), moimRow("y")] : []));
    const page = await listLocalMoims(sb, "u1", { lguId: "1381300000" });
    expect(page.items.map((m) => [m.id, m.hasRecruitingSchedule, m.status])).toEqual([
      ["x", true, "active"],
      ["y", false, "active"],
    ]);
    expect(calls.filter((c) => c.table === "moim_schedules")).toHaveLength(0);
  });
});

describe("U-12·U1-card-badge-sched 카드 배지 규칙", () => {
  it("종료 = 회색 「종료」 하나 · 흐린 표지", async () => {
    const { moimCardBadges, moimCardCoverDim } = await import("@/components/moim/MoimCard");
    const { moimCls } = await import("@/components/moim/moim-ui");
    const closed = moimCardBadges({ status: "closed", hasRecruitingSchedule: true, joinMode: "approval", viewerStatus: "pending" });
    expect(closed).toEqual([{ key: "closed", labelKey: "moim_card_closed_badge", tone: moimCls.badgeGray }]);
    expect(moimCardCoverDim({ status: "closed" })).toContain("opacity-50");
    expect(moimCardCoverDim({ status: "active" })).toBe("");
  });

  it("운영 중 = 일정 모집 중(회색 · D-25) → 승인제(회색) → 신청 중(경고)", async () => {
    const { moimCardBadges } = await import("@/components/moim/MoimCard");
    const { moimCls } = await import("@/components/moim/moim-ui");
    const b = moimCardBadges({ status: "active", hasRecruitingSchedule: true, joinMode: "approval", viewerStatus: "pending" });
    expect(b.map((x) => x.key)).toEqual(["sched", "approval", "pending"]);
    expect(b[0].tone).toBe(moimCls.badgeGray);
    expect(b[0].tone).not.toBe(moimCls.badgeGreen);
    expect(b[2].tone).toBe(moimCls.badgeWarn);
    expect(moimCardBadges({ status: "active", hasRecruitingSchedule: false, joinMode: "instant", viewerStatus: "active" })).toEqual([]);
  });

  it("배지 문구 ko·en", () => {
    expect(moimManageMessages.ko.moim_card_closed_badge).toBe("종료");
    expect(moimManageMessages.en.moim_card_closed_badge).toBe("Closed");
    expect(moimManageMessages.ko.moim_card_schedule_recruiting_badge).toBe("일정 모집 중");
  });
});

describe("U1-local-title 「{city} 모임」", () => {
  it("도시가 있으면 새 키, 없으면 지금 문구", async () => {
    const { moimLocalTitle } = await import("@/components/moim/MoimTabHome");
    const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ""}`;
    expect(moimLocalTitle("Taguig", t as never)).toBe('moim_home_local_city_title{"city":"Taguig"}');
    expect(moimLocalTitle("  ", t as never)).toBe("moim_home_local_title");
    expect(moimLocalTitle(null, t as never)).toBe("moim_home_local_title");
    expect(moimManageMessages.en.moim_home_local_city_title).toBe("Groups in {city}");
    expect(moimManageMessages.ko.moim_home_local_city_title).toBe("{city} 모임");
  });

  it("/api/moim 응답이 이미 계산한 cityLabel 을 싣는다", () => {
    const src = readFileSync("app/api/moim/route.ts", "utf8");
    expect(src).toMatch(/cityLabel: area\?\.dto\.status === "ok" \? area\.dto\.cityLabel : null/);
  });
});

describe("U-09 영어 단수 — count === 1 이면 _one 키", () => {
  const fill = (s: string, n: number) => s.replace(/\{(count|days|n)\}/g, String(n));

  it("moimCountKey 선택", async () => {
    const { moimCountKey } = await import("@/components/moim/manage/moim-manage-shared");
    expect(moimCountKey(1, "moim_manage_reports_count", "moim_manage_reports_count_one")).toBe("moim_manage_reports_count_one");
    expect(moimCountKey(0, "moim_manage_reports_count", "moim_manage_reports_count_one")).toBe("moim_manage_reports_count");
    expect(moimCountKey(2, "moim_manage_reports_count", "moim_manage_reports_count_one")).toBe("moim_manage_reports_count");
  });

  it("모임 6키 — _one 영어는 단수, 한국어는 같은 뜻", () => {
    const en = moimManageMessages.en as Record<string, string>;
    const ko = moimManageMessages.ko as Record<string, string>;
    const expected: Record<string, string> = {
      moim_manage_reports_count_one: "1 report",
      moim_manage_info_capacity_hint_one: "Leave empty for no limit. It cannot be lower than the current 1 member",
      moim_manage_invite_sent_toast_one: "Invite sent to 1 person",
      moim_manage_close_point_records_one: "Members can see past activity for 1 day",
      moim_album_added_toast_one: "Added 1 photo",
      moim_home_invites_banner_one: "You have 1 group invite",
    };
    for (const [k, v] of Object.entries(expected)) {
      expect(fill(en[k], 1)).toBe(v);
      expect(ko[k]).toBeTruthy();
    }
  });

  it("어드민 6키 — _one 영어는 단수", () => {
    const en = adminMoimMessages.en as Record<string, string>;
    const ko = adminMoimMessages.ko as Record<string, string>;
    const expected: Record<string, string> = {
      admin_moim_warn_count_one: "1 warning",
      admin_moim_days_ago_one: "1 day ago",
      admin_moim_comments_of_post_one: "View 1 comment",
      admin_moim_decide_days_n_one: "1 day",
      admin_moim_decide_close_same_one: "Also close 1 other report on this item",
      admin_moim_report_same_target_one: "1 report on this item",
    };
    for (const [k, v] of Object.entries(expected)) {
      expect(fill(en[k], 1)).toBe(v);
      expect(ko[k]).toBeTruthy();
    }
  });

  it("호출부가 count === 1 분기를 쓴다 (구조 확인)", () => {
    const sites: [string, string][] = [
      ["components/moim/manage/MoimManageReports.tsx", "moim_manage_reports_count_one"],
      ["components/moim/manage/MoimManageInfo.tsx", "moim_manage_info_capacity_hint_one"],
      ["components/moim/manage/MoimManageInvite.tsx", "moim_manage_invite_sent_toast_one"],
      ["components/moim/manage/MoimManageClose.tsx", "moim_manage_close_point_records_one"],
      ["components/moim/MoimAlbum.tsx", "moim_album_added_toast_one"],
      ["components/moim/MoimTabHome.tsx", "moim_home_invites_banner_one"],
      ["components/admin/moim/AdminMoimReportDecisionForm.tsx", "admin_moim_warn_count_one"],
      ["components/admin/moim/AdminMoimReportDecisionForm.tsx", "admin_moim_decide_days_n_one"],
      ["components/admin/moim/AdminMoimReportDecisionForm.tsx", "admin_moim_decide_close_same_one"],
      ["components/admin/moim/AdminMoimDetailPage.tsx", "admin_moim_warn_count_one"],
      ["components/admin/moim/admin-moim-detail-panels.tsx", "admin_moim_comments_of_post_one"],
      ["components/admin/moim/AdminMoimHostRequestsPage.tsx", "admin_moim_days_ago_one"],
      ["components/admin/moim/AdminMoimReportsPage.tsx", "admin_moim_report_same_target_one"],
    ];
    for (const [file, key] of sites) expect(readFileSync(file, "utf8"), `${file} → ${key}`).toContain(`"${key}"`);
  });
});

const member = (userId: string, over: Partial<MoimMemberDto> = {}): MoimMemberDto => ({
  userId,
  nickname: userId,
  avatarUrl: null,
  bio: "",
  role: "member",
  joinedAt: null,
  ...over,
});

describe("U7 멤버 관리 탭 — 멤버 N · 가입 신청 N · 차단 N · 메모", () => {
  const can = { decide_join: true, ban_member: true, write_note: true };
  const requests = [{ id: "r1" }, { id: "r2" }] as MoimJoinRequestDto[];
  const banned = [{ userId: "b1" }] as MoimBannedDto[];

  it("권한·받은 목록대로 탭과 수", async () => {
    const { moimManageMemberTabs } = await import("@/components/moim/manage/MoimManageMembers");
    const tabs = moimManageMemberTabs({ can, members: [member("a"), member("b"), member("c")], requests, banned });
    expect(tabs).toEqual([
      { key: "members", labelKey: "moim_manage_members_count_tab", count: 3 },
      { key: "requests", labelKey: "moim_manage_requests_count_tab", count: 2 },
      { key: "banned", labelKey: "moim_manage_banned_count_tab", count: 1 },
      { key: "notes", labelKey: "moim_manage_notes_tab", count: null },
    ]);
  });

  it("권한 없는 탭은 없고, 아직 못 받은 목록은 수 없이 이름만", async () => {
    const { moimManageMemberTabs } = await import("@/components/moim/manage/MoimManageMembers");
    expect(moimManageMemberTabs({ can: { decide_join: false, ban_member: false, write_note: false }, members: null, requests: null, banned: null })).toEqual([
      { key: "members", labelKey: "moim_manage_members_tab", count: null },
    ]);
    expect(moimManageMemberTabs({ can, members: [], requests: null, banned: null }).map((x) => [x.key, x.count])).toEqual([
      ["members", 0],
      ["requests", null],
      ["banned", null],
      ["notes", null],
    ]);
  });

  it("메모 탭 = 메모가 있는 멤버만", async () => {
    const { moimMembersWithNote } = await import("@/components/moim/manage/MoimManageMembers");
    const list = [member("a", { note: "자주 늦음" }), member("b", { note: "  " }), member("c", { note: null }), member("d")];
    expect(moimMembersWithNote(list).map((m) => m.userId)).toEqual(["a"]);
  });

  it("가입 신청 수는 승인 권한자에게만 기존 목록 API 를 부른다 (구조 확인)", () => {
    const src = readFileSync("components/moim/manage/MoimManageMembers.tsx", "utf8");
    expect(src).toMatch(/canDecide \? moimApi\.joinRequests\(moimId\) : Promise\.resolve/);
    expect(src).toContain('from "@/components/moim/use-moim-direct-message"');
    expect(src).not.toContain("/api/community-messenger/direct/start");
  });
});

describe("U-16 G-dis-03 위임 요청 버튼", () => {
  it("경고·권한 없음·이미 보냄이면 그리지 않는다", async () => {
    const { transferButtonHidden } = await import("@/components/moim/manage/MoimManageTransfer");
    expect(transferButtonHidden({ warned: false, canTransfer: true, sentTo: null })).toBe(false);
    expect(transferButtonHidden({ warned: true, canTransfer: true, sentTo: null })).toBe(true);
    expect(transferButtonHidden({ warned: false, canTransfer: false, sentTo: null })).toBe(true);
    expect(transferButtonHidden({ warned: false, canTransfer: true, sentTo: "민수" })).toBe(true);
  });
});
