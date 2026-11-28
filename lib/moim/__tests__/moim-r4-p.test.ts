import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 모임 R4 — 남은 P3 (설계 docs/audit/moim-r4-decisions-design-2026-11-28.md §4)
 * #1 입력 상한 · #2 내보내기 사유 · #3 나가기 안내 · #4·5 더 보기 커서 · #6 목록 상한 · #7·8 조회 줄임
 * #10 삭제 신고 내용 비움 · #15 로그아웃 ⋮ · #16 머리글 초대 7일 · #17 뒤로 경로 · D-39 QR
 */

import {
  __resetMoimInactiveUnlistDaysCacheForTests,
  getMoimDetail,
  listLocalMoims,
  listMoimBans,
  listMoimComments,
  listMoimInviteLinks,
  listMoimJoinRequests,
  listMoimMembers,
  type MoimAccess,
} from "@/lib/moim/server/moim-queries.server";
import { listMoimScheduleParticipants, listMoimSchedules } from "@/lib/moim/server/moim-schedule-queries.server";
import { listMoimStaffReports } from "@/lib/moim/server/moim-staff-reports.server";
import { MOIM_LIST_CAP, moimListCapped, type MoimCommentDto, type MoimDetailDto, type MoimPostDto, type MoimScheduleDto } from "@/lib/moim/moim-api-types";
import { moimCommentSection, prependMoimComments } from "@/components/moim/MoimPostDetailScreen";
import { mergeMoimSchedulePage, MOIM_HOME_UPCOMING_LIMIT } from "@/components/moim/MoimMemberView";
import { moimDetailMenuVisible } from "@/components/moim/MoimDetailScreen";
import { MOIM_HEADER_INVITE_EXPIRY_DAYS, moimHeaderInviteExpiresAt } from "@/components/moim/use-moim-invite-share";
import { canOpenMoimManageHub, moimManageBackHref } from "@/components/moim/manage/moim-manage-shared";
import { MOIM_INVITE_QR_OPTIONS } from "@/components/moim/manage/MoimManageInvite";
import { moimScreensMessages } from "@/lib/i18n/catalog/moim-screens";
import { moimManageMessages } from "@/lib/i18n/catalog/moim-manage";

type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };

/** 표마다 정해 둔 행을 돌려주고, 표·체인 호출(메서드·인자)을 모두 적는 가짜 Supabase */
function recordingSb(tables: Record<string, unknown[]>, errors: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const sb = {
    calls,
    tablesCalled: () => calls.map((c) => c.table),
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "not", "order", "limit", "lt", "gt", "gte", "neq", "ilike"]) {
        chain[m] = (...args: unknown[]) => {
          call.ops.push([m, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: errors[table] ?? null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: errors[table] ?? null });
      return chain;
    },
  };
  return sb;
}
const opsOf = (sb: ReturnType<typeof recordingSb>, table: string) => sb.calls.filter((c) => c.table === table).flatMap((c) => c.ops);

const moimRow = {
  id: "m1",
  name: "M",
  intro: "",
  category_id: "c1",
  lgu_id: "1381300000",
  join_mode: "instant",
  capacity: null,
  host_user_id: "u9",
  status: "active",
  platform_state: "normal",
  member_count: 2,
  last_activity_at: "",
  main_room_id: "r1",
  created_at: "",
  updated_at: "",
  retention_ended_at: null,
};

function access(role: MoimAccess["role"] = "host"): MoimAccess {
  return { moim: moimRow as never, me: null, role, overrides: {} };
}

const iso = (n: number) => `2026-11-${String(n).padStart(2, "0")}T00:00:00.000Z`;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("#4·5 댓글 쪽 — 최신 100개부터, 「이전 댓글 더 보기」 커서", () => {
  const post = { id: "p1", moimId: "m1" } as MoimPostDto;
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: uuid(n - i), post_id: "p1", author_id: "u2", body: `c${n - i}`, created_at: iso(28 - (i % 20)) }));

  it("101개를 받으면 100개만, 오래된 순으로 돌려주고 nextBefore = 가장 오래된 것", async () => {
    const sb = recordingSb({ moim_comments: rows(101), moim_members: [] });
    const page = await listMoimComments(sb as never, post, "u1");
    expect(page.items).toHaveLength(100);
    // DB 는 최신순 → 화면은 오래된 순(마지막 = 가장 최신)
    expect(page.items[page.items.length - 1]?.id).toBe(uuid(101));
    expect(page.items[0]?.id).toBe(uuid(2));
    expect(page.nextBefore).toBe(`${rows(101)[99]!.created_at}|${uuid(2)}`);
    const ops = opsOf(sb, "moim_comments");
    expect(ops).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(ops).toContainEqual(["order", "id", { ascending: false }]);
    expect(ops).toContainEqual(["limit", 101]);
  });

  it("마지막 쪽이면 nextBefore = null", async () => {
    const sb = recordingSb({ moim_comments: rows(3), moim_members: [] });
    const page = await listMoimComments(sb as never, post, "u1");
    expect(page.items.map((c) => c.body)).toEqual(["c1", "c2", "c3"]);
    expect(page.nextBefore).toBeNull();
  });

  it("커서는 시각|id 조건으로 DB 에 넘기고, 잘못된 커서는 DB 를 부르지 않고 빈 쪽", async () => {
    const sb = recordingSb({ moim_comments: [], moim_members: [] });
    await listMoimComments(sb as never, post, "u1", { before: `${iso(5)}|${uuid(7)}` });
    expect(opsOf(sb, "moim_comments")).toContainEqual(["or", `created_at.lt."${iso(5)}",and(created_at.eq."${iso(5)}",id.lt.${uuid(7)})`]);
    const bad = recordingSb({ moim_comments: rows(2) });
    expect(await listMoimComments(bad as never, post, "u1", { before: "verify-x" })).toEqual({ items: [], nextBefore: null });
    expect(bad.tablesCalled()).toEqual([]);
  });

  it("화면: 앞 쪽을 위에 붙이고 겹친 댓글은 한 번만 · 앞이 남았으면 수는 글의 댓글 수", () => {
    const c = (id: string) => ({ id }) as MoimCommentDto;
    expect(prependMoimComments([c("a"), c("b")], [c("b"), c("c")]).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moimCommentSection(true, { commentCount: 250 }, 100, true)).toEqual({ count: 250, note: null });
    // 기존 동작(앞이 없음)은 그대로
    expect(moimCommentSection(true, { commentCount: 4 }, 4)).toEqual({ count: 4, note: null });
    expect(moimCommentSection(true, { commentCount: 0 }, 0)).toEqual({ count: 0, note: "empty" });
  });
});

describe("#4·5 지난 일정 더 보기 · #7·8 홈 다가오는 일정 3개", () => {
  const sched = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: uuid(i + 1),
      moim_id: "m1",
      host_user_id: null,
      title: `s${i}`,
      starts_at: iso(27 - (i % 25)),
      ends_at: null,
      place_text: null,
      description: null,
      images: [],
      capacity: null,
      join_mode: "instant",
      ask_motivation: false,
      status: "done",
      confirmed_count: 0,
      room_id: null,
      created_at: iso(1),
      updated_at: iso(1),
    }));

  it("지난 일정: 시작 최근 순 + id, 상한+1 을 읽어 다음 쪽 커서를 준다", async () => {
    const sb = recordingSb({ moim_schedules: sched(31), moim_schedule_participants: [], moim_members: [] });
    const page = await listMoimSchedules(sb as never, access("member"), "u1", { scope: "past" });
    expect(page?.items).toHaveLength(30);
    expect(page?.nextBefore).toBe(`${sched(31)[29]!.starts_at}|${uuid(30)}`);
    const ops = opsOf(sb, "moim_schedules");
    expect(ops).toContainEqual(["in", "status", ["done", "cancelled"]]);
    expect(ops).toContainEqual(["order", "starts_at", { ascending: false }]);
    expect(ops).toContainEqual(["order", "id", { ascending: false }]);
    expect(ops).toContainEqual(["limit", 31]);
  });

  it("다음 쪽: before 커서 조건 · 잘못된 커서는 DB 없이 빈 쪽", async () => {
    const sb = recordingSb({ moim_schedules: [], moim_schedule_participants: [], moim_members: [] });
    await listMoimSchedules(sb as never, access("member"), "u1", { scope: "past", before: `${iso(3)}|${uuid(9)}` });
    expect(opsOf(sb, "moim_schedules")).toContainEqual(["or", `starts_at.lt."${iso(3)}",and(starts_at.eq."${iso(3)}",id.lt.${uuid(9)})`]);
    const bad = recordingSb({ moim_schedules: sched(2) });
    expect(await listMoimSchedules(bad as never, access("member"), "u1", { scope: "past", before: "2026|x" })).toEqual({ items: [], nextBefore: null });
    expect(bad.tablesCalled()).toEqual([]);
  });

  it("다가오는 일정: limit 3 이면 3개만 읽고 커서 없음", async () => {
    const sb = recordingSb({ moim_schedules: sched(3).map((s) => ({ ...s, status: "recruiting" })), moim_schedule_participants: [], moim_members: [] });
    const page = await listMoimSchedules(sb as never, access("member"), "u1", { scope: "upcoming", limit: MOIM_HOME_UPCOMING_LIMIT });
    expect(opsOf(sb, "moim_schedules")).toContainEqual(["limit", 3]);
    expect(page?.nextBefore).toBeNull();
  });

  it("비멤버는 null · 화면 병합은 이미 받은 일정을 다시 붙이지 않는다", async () => {
    expect(await listMoimSchedules(recordingSb({}) as never, access(null), null, { scope: "past" })).toBeNull();
    const s = (id: string) => ({ id }) as MoimScheduleDto;
    expect(mergeMoimSchedulePage([s("a")], [s("a"), s("b")]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(mergeMoimSchedulePage(null, [s("c")]).map((x) => x.id)).toEqual(["c"]);
  });
});

describe("#6 상한 없던 목록 5곳 = 500 · 닿으면 안내", () => {
  it("가입 신청·차단·초대 링크·메모·일정 참여자 조회에 limit(500)", async () => {
    const sb = recordingSb({ moim_join_requests: [], moim_join_questions: [], moim_bans: [], moim_invites: [], moim_members: [], moim_member_notes: [] });
    await listMoimJoinRequests(sb as never, access("host"));
    await listMoimBans(sb as never, access("host"));
    await listMoimInviteLinks(sb as never, access("host"));
    for (const t of ["moim_join_requests", "moim_bans", "moim_invites"]) expect(opsOf(sb, t), t).toContainEqual(["limit", MOIM_LIST_CAP]);
    /** 재감사 6: 만료 링크는 DB 에서 거른다 — 500행이 오면 그대로 capped */
    const inviteOr = opsOf(sb, "moim_invites").find((o) => o[0] === "or");
    expect(String(inviteOr?.[1])).toMatch(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-/);

    const withMembers = recordingSb({
      moim_members: [{ moim_id: "m1", user_id: "u2", role: "member", status: "active", nickname: "a", avatar_url: null, bio: "", joined_at: "", rejoin_count: 0 }],
      moim_member_notes: Array.from({ length: MOIM_LIST_CAP }, (_, i) => ({ target_user_id: `t${i}`, body: "x" })),
    });
    const out: { notesCapped?: boolean } = {};
    await listMoimMembers(withMembers as never, access("host"), out);
    expect(opsOf(withMembers, "moim_member_notes")).toContainEqual(["limit", MOIM_LIST_CAP]);
    expect(out.notesCapped).toBe(true);

    const p = recordingSb({ moim_schedule_participants: [], moim_members: [] });
    await listMoimScheduleParticipants(p as never, { id: "s1", moimId: "m1", viewer: { canManage: true } } as never);
    expect(opsOf(p, "moim_schedule_participants")).toContainEqual(["limit", MOIM_LIST_CAP]);
  });

  it("상한 판정 = 받은 수 ≥ 500 (운영진 신고함과 같은 규칙)", () => {
    expect(moimListCapped(499)).toBe(false);
    expect(moimListCapped(500)).toBe(true);
  });
});

describe("#7·8 모임 상세 — 멤버는 신청·차단·일정 미리보기를 읽지 않는다", () => {
  const tables = {
    moims: [moimRow],
    moim_permissions: [],
    moim_categories: [{ id: "c1", slug: "s", label_ko: "운동", label_en: "Sports", allow_custom_topic: false }],
    moim_join_questions: [],
    moim_boards: [],
    moim_join_requests: [{ id: "jr1" }],
    moim_bans: [],
    moim_host_transfers: [],
    moim_posts: [],
    moim_schedules: [{ id: "s1", title: "T", starts_at: "2099-01-01T00:00:00Z", place_text: null, confirmed_count: 0, capacity: null, status: "recruiting" }],
  };

  it("멤버: 세 표를 부르지 않는다 · 비멤버: 셋 다 읽고 가입 대기·미리보기가 응답에 담긴다", async () => {
    const member = recordingSb({
      ...tables,
      moim_members: [{ moim_id: "m1", user_id: "u1", role: "member", status: "active", nickname: "me", avatar_url: null, bio: "", joined_at: "", rejoin_count: 0 }],
    });
    const d = await getMoimDetail(member as never, "m1", "u1");
    expect(d?.viewer.status).toBe("active");
    for (const t of ["moim_join_requests", "moim_bans", "moim_schedules"]) expect(member.tablesCalled(), t).not.toContain(t);
    expect(d?.upcomingSchedules).toEqual([]);

    const outsider = recordingSb({ ...tables, moim_members: [] });
    const p = await getMoimDetail(outsider as never, "m1", "u5");
    for (const t of ["moim_join_requests", "moim_bans", "moim_schedules"]) expect(outsider.tablesCalled(), t).toContain(t);
    expect(p?.viewer.pendingRequestId).toBe("jr1");
    expect(p?.upcomingSchedules.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("#7·8 비활동 비노출 일수 = 프로세스 캐시", () => {
  beforeEach(() => __resetMoimInactiveUnlistDaysCacheForTests());

  it("동네 목록을 두 번 열어도 정책 행은 한 번만 읽는다 · 읽기 실패는 캐시하지 않는다", async () => {
    const sb = recordingSb({ moims: [], moim_policies: [{ inactive_unlist_days: 90 }] });
    await listLocalMoims(sb as never, null, { lguId: "1381300000" });
    await listLocalMoims(sb as never, null, { lguId: "1381300000" });
    expect(sb.tablesCalled().filter((t) => t === "moim_policies")).toHaveLength(1);
    expect(opsOf(sb, "moims").some((o) => o[0] === "gte" && o[1] === "last_activity_at")).toBe(true);

    __resetMoimInactiveUnlistDaysCacheForTests();
    const failing = recordingSb({ moims: [], moim_policies: [] }, { moim_policies: { message: "x" } });
    await listLocalMoims(failing as never, null, { lguId: "1381300000" });
    await listLocalMoims(failing as never, null, { lguId: "1381300000" });
    expect(failing.tablesCalled().filter((t) => t === "moim_policies")).toHaveLength(2);
  });
});

describe("#10 운영진 신고함 — 작성자가 지운 글·댓글·사진은 내용을 비운다", () => {
  it("삭제 = 제목·발췌·사진 null · 숨김은 그대로 보인다", async () => {
    const sb = recordingSb({
      moim_reports: [
        { target_type: "post", target_id: "p-del", reason_code: "spam_ad", created_at: iso(3) },
        { target_type: "post", target_id: "p-hid", reason_code: "spam_ad", created_at: iso(3) },
        { target_type: "comment", target_id: "c-del", reason_code: "spam_ad", created_at: iso(3) },
        { target_type: "album", target_id: "a-del", reason_code: "spam_ad", created_at: iso(3) },
      ],
      moim_posts: [
        { id: "p-del", author_id: "u2", title: "secret", body: "body", images: ["https://x/1.jpg"], status: "deleted" },
        { id: "p-hid", author_id: "u2", title: "seen", body: "b", images: ["https://x/2.jpg"], status: "hidden" },
      ],
      moim_comments: [{ id: "c-del", post_id: "p-hid", author_id: "u2", body: "gone", status: "deleted" }],
      moim_album_items: [{ id: "a-del", uploader_id: "u2", url: "https://x/3.jpg", status: "deleted" }],
      moim_members: [],
    });
    const r = await listMoimStaffReports(sb as never, access("host"));
    const by = new Map(r!.reports.map((x) => [x.targetId, x]));
    expect(by.get("p-del")).toMatchObject({ status: "deleted", title: null, excerpt: null, imageUrl: null });
    expect(by.get("c-del")).toMatchObject({ status: "deleted", excerpt: null });
    expect(by.get("a-del")).toMatchObject({ status: "deleted", imageUrl: null });
    expect(by.get("p-hid")).toMatchObject({ status: "hidden", title: "seen", imageUrl: "https://x/2.jpg" });
  });
});

describe("#15 · #16 · #17 · D-39 화면 판정", () => {
  const detail = (over: Partial<MoimDetailDto> = {}): MoimDetailDto =>
    ({
      id: "m1",
      status: "active",
      platformState: "normal",
      viewer: { loggedIn: true, status: "active", role: "member" },
      can: { decide_join: false, remove_member: false, ban_member: false, set_role: false, write_note: false, edit_info: false, manage_invite_link: false, send_invite: false, manage_boards: false, hide_post: false, transfer_host: false, close: false },
      ...over,
    }) as MoimDetailDto;

  it("#15 로그아웃 방문자에게는 ⋮ 없음", () => {
    expect(moimDetailMenuVisible(detail({ viewer: { loggedIn: false } as MoimDetailDto["viewer"] }))).toBe(false);
    expect(moimDetailMenuVisible(detail())).toBe(true);
  });

  it("#16 머리글 공유 초대 링크 = 7일 뒤 만료 (운영 화면 기본값과 같음)", () => {
    expect(MOIM_HEADER_INVITE_EXPIRY_DAYS).toBe(7);
    const now = Date.parse("2026-11-28T00:00:00.000Z");
    expect(moimHeaderInviteExpiresAt(now)).toBe("2026-12-05T00:00:00.000Z");
  });

  it("#17 허브에 들어갈 항목이 없으면 뒤로 = 모임 홈, 있으면 허브, 지정값이 우선, 읽기 전엔 허브", () => {
    const plain = detail();
    expect(canOpenMoimManageHub(plain)).toBe(false);
    expect(moimManageBackHref("m1", undefined, plain)).toBe("/moim/m1");
    const staff = detail({ can: { ...plain.can, hide_post: true } });
    expect(canOpenMoimManageHub(staff)).toBe(true);
    expect(moimManageBackHref("m1", undefined, staff)).toBe("/moim/m1/manage");
    // 부모임장·운영진은 권한이 없어도 「모임장 변경 요청」 항목이 있다
    expect(canOpenMoimManageHub(detail({ viewer: { loggedIn: true, status: "active", role: "staff" } as MoimDetailDto["viewer"] }))).toBe(true);
    expect(moimManageBackHref("m1", "/x", plain)).toBe("/x");
    expect(moimManageBackHref("m1", undefined, null)).toBe("/moim/m1/manage");
  });

  it("D-39 초대 링크 QR 옵션 = 브랜드 그린·흰 바탕·오류 정정 M·240px", () => {
    expect(MOIM_INVITE_QR_OPTIONS).toEqual({ errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#0B421A", light: "#FFFFFF" } });
  });
});

describe("#3 나가기 안내 · 새 문구 ko·en", () => {
  it("남는 것 · 일정 자동 취소 · 나간 뒤에도 내 것 삭제 가능(D-36) — 「나가기 전에 지우세요」 없음", () => {
    const ko = moimScreensMessages.ko.moim_leave_confirm_body;
    expect(ko).toContain("쓴 글과 댓글은 남아요");
    expect(ko).toContain("확정한 다가오는 일정은 자동으로 취소돼요");
    expect(ko).toContain("나간 뒤에도 지울 수 있어요");
    expect(ko).not.toContain("나가기 전에");
    expect(moimScreensMessages.en.moim_leave_confirm_body).toMatch(/canceled/);
    for (const k of ["moim_comments_older_btn", "moim_list_capped_hint"] as const) {
      expect(moimScreensMessages.ko[k], k).toBeTruthy();
      expect(moimScreensMessages.en[k], k).toBeTruthy();
    }
    for (const k of ["moim_manage_invite_qr_btn", "moim_manage_invite_qr_hide_btn", "moim_manage_invite_qr_alt"] as const) {
      expect(moimManageMessages.ko[k], k).toBeTruthy();
      expect(moimManageMessages.en[k], k).toBeTruthy();
    }
  });
});

describe("#1 · #2 구조 확인 (원본 문자열 — 동작 시험 아님)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("#1 입력칸 maxLength = 서버 기준 (닉네임 40 · 소개 300 · 제목 120 · 본문 10000)", () => {
    const join_ = src("components/moim/MoimJoinSheet.tsx");
    expect(join_).toMatch(/value=\{nickname\}\s+maxLength=\{40\}/);
    expect(join_).toMatch(/value=\{bio\}\s+maxLength=\{300\}/);
    expect(src("components/moim/MoimCreateWizard.tsx")).toMatch(/value=\{nickname\} maxLength=\{40\}/);
    expect(src("components/moim/MoimProfileScreen.tsx")).toMatch(/value=\{bio\} maxLength=\{300\}/);
    const write = src("components/moim/MoimWriteScreen.tsx");
    expect(write).toMatch(/value=\{title\} maxLength=\{120\}/);
    expect(write).toMatch(/value=\{body\}\s+maxLength=\{10000\}/);
  });
  it("#2 내보내기 시트가 사유(300)를 removeMember 에 넘긴다", () => {
    const m = src("components/moim/manage/MoimManageMembers.tsx");
    expect(m).toContain('htmlFor="moim-remove-reason"');
    expect(m).toContain("moimApi.removeMember(moimId, target.userId, false, why || null)");
  });
});
