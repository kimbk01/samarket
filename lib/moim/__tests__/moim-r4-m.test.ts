import "@/lib/i18n/admin-catalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 모임 R4 — 메신저 쪽 (설계 docs/audit/moim-r4-decisions-design-2026-11-28.md)
 * §1 메신저 이름 · §2-2 D-3 「모임 홈」 숨김 · #14 판정 중 · #18 역할 표시 · §5(a) DELETE 대체 경로 ·
 * §5(b)① 부제 · §5(b)③ start_dm · §5(c) 어드민 읽기 전용 · D-42 · D-44 · D-45
 */

vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-community-messenger/sync-room-after-admin-hide", () => ({
  syncRoomAfterAdminMessageVisibility: vi.fn(async () => undefined),
}));

import { translate } from "@/lib/i18n/messages";
import {
  __resetMoimRoomOwnerCacheForTests,
  moimRoomMemberRoleKey,
  moimRoomOwnerShowsHome,
  peekMoimRoomOwner,
  peekMoimRoomOwnerResolved,
  requestMoimRoomOwners,
  type MoimRoomOwner,
} from "@/lib/moim/use-moim-room-owner";
import { messengerRoomTitleDisplayKey } from "@/lib/community-messenger/room/messenger-room-display-title";
import { markParticipantLeft } from "@/lib/community-messenger/group/group-room-repository";
import { runCmRoomActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";
import {
  MOIM_ROOM_READONLY_MANAGED_BY_MOIM,
  rejectsMoimRoomReadonlyAction,
} from "@/lib/admin-community-messenger/moim-room-admin-guard";

type Call = { table: string; op: string; select?: string; filters: string[] };

/** 표별 행을 돌려주는 가짜 Supabase — 호출·필터·select 문자열을 기록한다 */
function fakeSb(tables: Record<string, unknown[]>, opts: { updateError?: { message: string } } = {}) {
  const calls: Call[] = [];
  const sb = {
    calls,
    from(table: string) {
      const entry: Call = { table, op: "select", filters: [] };
      calls.push(entry);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      chain.select = (cols?: string) => {
        if (entry.op === "select") entry.select = cols;
        return chain;
      };
      chain.update = () => {
        entry.op = "update";
        return chain;
      };
      chain.delete = () => {
        entry.op = "delete";
        return chain;
      };
      for (const m of ["eq", "is", "in", "or", "neq"]) {
        chain[m] = (col: string, v: unknown) => {
          entry.filters.push(`${m}:${col}=${Array.isArray(v) ? v.join("|") : String(v)}`);
          return chain;
        };
      }
      for (const m of ["order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          entry.op === "update" && opts.updateError
            ? { data: null, error: opts.updateError }
            : { data: entry.op === "update" ? [{ id: "r1" }] : rows, error: null }
        );
      return chain;
    },
  };
  return sb;
}

const ROOM_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ROOM_B = "bbbbbbbb-2222-4222-8222-222222222222";

async function callRoomsRoute(tables: Record<string, unknown[]>, viewer = "u1") {
  const sb = fakeSb(tables);
  vi.resetModules();
  vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
    const actual = await vi.importActual<object>("@/lib/moim/server/moim-route-guard.server");
    return { ...actual, guardMoimRead: async () => ({ ok: true, userId: viewer, sb }) };
  });
  const { GET } = await import("@/app/api/moim/rooms/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`https://x.test/api/moim/rooms?ids=${ROOM_A},${ROOM_B}`));
  vi.doUnmock("@/lib/moim/server/moim-route-guard.server");
  return { body: (await res.json()) as { owners: Record<string, MoimRoomOwner> }, calls: sb.calls };
}

describe("§1 · D-42 메신저 「모임」 이름 = 오픈채팅", () => {
  it("오픈채팅을 가리키던 문구가 「오픈채팅」이 된다 (ko·en)", () => {
    expect(translate("ko", "nav_messenger_open_group")).toBe("오픈채팅");
    expect(translate("ko", "cm_ui_find_meeting")).toBe("오픈채팅 찾기");
    expect(translate("ko", "cm_ui_create_open_group_room")).toBe("오픈채팅 만들기");
    expect(translate("ko", "cm_svc_open_group_room")).toBe("오픈채팅");
    expect(translate("ko", "tier1_messenger_hub_subtitle")).toBe("친구 · 채팅 · 오픈채팅");
    expect(translate("ko", "cm_settings_page_meeting")).toBe("모임·오픈채팅");
    expect(translate("ko", "nav_messenger_open_group_settings")).toBe("오픈채팅 설정");
    expect(translate("ko", "nav_messenger_room_settings")).toBe("채팅방 설정");
    expect(translate("ko", "nav_chat_kind_group")).toBe("그룹");
    expect(translate("ko", "nav_chat_kind_open")).toBe("오픈채팅");
    expect(translate("en", "nav_messenger_open_group")).toBe("Open chat");
    for (const key of [
      "nav_messenger_open_group",
      "cm_ui_find_meeting",
      "cm_ui_search_meeting",
      "cm_ui_meeting_notice",
      "cm_ui_join_meeting",
      "cm_ui_room_action_meeting_info",
      "cm_ui_meeting_preview",
      "nav_messenger_open_group_view_desc",
    ] as const) {
      expect(translate("ko", key)).not.toMatch(/모임/);
    }
  });

  it("예전 저장 제목 「공개 그룹방」·「Open group」도 오픈채팅 대체 제목으로 알아본다", () => {
    expect(messengerRoomTitleDisplayKey({ title: "공개 그룹방", roomType: "open_group" })).toEqual({ key: "cm_svc_open_group_room" });
    expect(messengerRoomTitleDisplayKey({ title: "Open group", roomType: "open_group" })).toEqual({ key: "cm_svc_open_group_room" });
    expect(messengerRoomTitleDisplayKey({ title: "오픈채팅", roomType: "open_group" })).toEqual({ key: "cm_svc_open_group_room" });
    expect(messengerRoomTitleDisplayKey({ title: "공개 그룹방", roomType: "private_group" })).toBeNull();
  });

  it("비공개 그룹·모임 방 머리글 aria 는 「채팅방 설정」, 오픈채팅은 「오픈채팅 설정」 (구조 확인)", () => {
    const header = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx", "utf8");
    expect(header.match(/vm\.isPrivateGroupRoom \? "nav_messenger_room_settings" : "nav_messenger_open_group_settings"/g)?.length).toBe(2);
  });
});

describe("/api/moim/rooms — moimStatus · 역할 맵 · start_dm (D-3 · #18 · D-45)", () => {
  afterEach(() => vi.resetModules());

  it("삭제된 모임 상태·역할 있는 멤버만·보는 사람 권한을 같은 응답에 준다 — Supabase 요청 수는 그대로(4)", async () => {
    const { body, calls } = await callRoomsRoute(
      {
        community_messenger_participants: [{ room_id: ROOM_A }, { room_id: ROOM_B }],
        community_messenger_rooms: [
          { id: ROOM_A, owner_ref_id: "m1" },
          { id: ROOM_B, owner_ref_id: "m2" },
        ],
        moims: [
          {
            id: "m1",
            name: "Alive",
            status: "active",
            platform_state: "normal",
            moim_members: [
              { user_id: "h1", role: "host" },
              { user_id: "c1", role: "co_host" },
              { user_id: "s1", role: "staff" },
              { user_id: "u1", role: "member" },
            ],
            moim_permissions: [],
          },
          {
            id: "m2",
            name: "Gone",
            status: "deleted",
            platform_state: "normal",
            moim_members: [{ user_id: "u1", role: "staff" }],
            moim_permissions: [],
          },
        ],
        moim_schedules: [],
      },
      "u1"
    );
    expect(body.owners[ROOM_A]).toEqual({
      moimId: "m1",
      kind: "moim",
      moimName: "Alive",
      moimStatus: "active",
      memberRoles: { h1: "host", c1: "co_host", s1: "staff" },
      canStartDm: true,
    });
    /** 삭제된 모임 = 모임 방 판정은 그대로(owner 있음) · 상태만 deleted · 모임이 활성이 아니라 [1:1] 없음 */
    expect(body.owners[ROOM_B]).toMatchObject({ moimId: "m2", kind: "moim", moimStatus: "deleted", canStartDm: false });
    expect(calls.map((c) => c.table)).toEqual([
      "community_messenger_participants",
      "community_messenger_rooms",
      "moims",
      "moim_schedules",
    ]);
    const moimsCall = calls.find((c) => c.table === "moims")!;
    expect(moimsCall.select).toContain("moim_members(user_id, role)");
    expect(moimsCall.select).toContain("moim_permissions(action, min_role)");
    expect(moimsCall.filters).toEqual(expect.arrayContaining(["eq:moim_members.status=active", "eq:moim_permissions.action=start_dm"]));
    /** 나간 방은 참여 중이 아니다 */
    expect(calls[0].filters).toContain("is:left_at=null");
  });

  it("start_dm 최소 역할을 운영진으로 올리면 일반 멤버는 [1:1] 없음, 운영진은 있음", async () => {
    const moim = (viewerRole: string) => ({
      community_messenger_participants: [{ room_id: ROOM_A }],
      community_messenger_rooms: [{ id: ROOM_A, owner_ref_id: "m1" }],
      moims: [
        {
          id: "m1",
          name: "M",
          status: "active",
          platform_state: "normal",
          moim_members: [{ user_id: "u1", role: viewerRole }],
          moim_permissions: [{ action: "start_dm", min_role: "staff" }],
        },
      ],
      moim_schedules: [],
    });
    expect((await callRoomsRoute(moim("member"))).body.owners[ROOM_A].canStartDm).toBe(false);
    const staff = await callRoomsRoute(moim("staff"));
    expect(staff.body.owners[ROOM_A].canStartDm).toBe(true);
    expect(staff.body.owners[ROOM_A].memberRoles).toEqual({ u1: "staff" });
  });
});

describe("D-3 · #18 화면 판정 함수", () => {
  const base: MoimRoomOwner = { moimId: "m1", kind: "moim", moimName: "M" };

  it("삭제된 모임만 「모임 홈」 진입점을 숨긴다 (옛 응답·종료 모임은 보임)", () => {
    expect(moimRoomOwnerShowsHome({ ...base, moimStatus: "deleted" })).toBe(false);
    expect(moimRoomOwnerShowsHome({ ...base, moimStatus: "closed" })).toBe(true);
    expect(moimRoomOwnerShowsHome({ ...base, moimStatus: "active" })).toBe(true);
    expect(moimRoomOwnerShowsHome(base)).toBe(true);
    expect(moimRoomOwnerShowsHome(null)).toBe(false);
  });

  it("이름 옆 역할 = 모임장·부모임장·운영진만 (시안 U8 「준호 · 운영진」)", () => {
    const owner = { ...base, memberRoles: { a: "host", b: "co_host", c: "staff" } } as MoimRoomOwner;
    expect(moimRoomMemberRoleKey(owner, "a")).toBe("moim_role_host");
    expect(moimRoomMemberRoleKey(owner, "b")).toBe("moim_role_co_host");
    expect(moimRoomMemberRoleKey(owner, "c")).toBe("moim_role_staff");
    expect(moimRoomMemberRoleKey(owner, "d")).toBeNull();
    expect(moimRoomMemberRoleKey(null, "a")).toBeNull();
    expect(`준호 · ${translate("ko", moimRoomMemberRoleKey(owner, "c")!)}`).toBe("준호 · 운영진");
  });

  it("멤버 목록·멤버 시트·말풍선이 같은 역할 맵을 쓰고, 멤버 시트 [1:1 대화]는 canStartDm 을 따른다 · [통화]는 그대로 (구조 확인)", () => {
    const sheets = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx", "utf8");
    const modal = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx", "utf8");
    const timeline = readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx", "utf8");
    expect(sheets.match(/\{moimRoleSuffix\(member\.id\)\}/g)?.length).toBe(2);
    expect(modal).toContain('const showStartDirectChat = !moimOwner || moimOwner.canStartDm !== false;');
    expect(modal).toContain("{showStartDirectChat ? (");
    expect(modal).toContain('data-cm-member-call=""');
    expect(modal).not.toMatch(/showStartDirectChat[^\n]*data-cm-member-call/);
    expect(timeline).toContain("moimRoomMemberRoleKey(moimRoleOwnerForBubble, message.senderId)");
  });
});

describe("#14 모임 방 판정 중(unknown)", () => {
  beforeEach(() => {
    __resetMoimRoomOwnerCacheForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetMoimRoomOwnerCacheForTests();
  });

  it("응답 전 = 판정 중, 응답 후 = 판정 끝(모임 방/아님)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, owners: { r1: { moimId: "m1", kind: "moim", moimName: "M" } } }) }))
    );
    requestMoimRoomOwners(["r1", "r2"]);
    expect(peekMoimRoomOwnerResolved("r1")).toBe(false);
    expect(peekMoimRoomOwnerResolved("r2")).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(peekMoimRoomOwnerResolved("r1")).toBe(true);
    expect(peekMoimRoomOwner("r1")?.moimId).toBe("m1");
    expect(peekMoimRoomOwnerResolved("r2")).toBe(true);
    expect(peekMoimRoomOwner("r2")).toBeNull();
  });

  it("판정 요청이 실패하면 판정 끝으로 보고 메뉴를 보인다(예전 동작)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null })));
    requestMoimRoomOwners(["r9"]);
    expect(peekMoimRoomOwnerResolved("r9")).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(peekMoimRoomOwnerResolved("r9")).toBe(true);
    expect(peekMoimRoomOwner("r9")).toBeNull();
  });

  it("방 화면·목록 메뉴는 판정 중인 비공개 그룹방을 모임 방처럼 다룬다 (구조 확인)", () => {
    const pres = readFileSync("lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts", "utf8");
    const sheet = readFileSync("components/community-messenger/MessengerChatRoomActionSheet.tsx", "utf8");
    expect(pres).toContain("const isMoimRoom = Boolean(moimRoomOwner) || Boolean(isPrivateGroupRoom && !moimRoomResolved);");
    /** 재감사 5: 시트는 판정 결과를 구독한다(열 때 한 번 읽기 아님) */
    expect(sheet).toContain("useMoimRoomOwnerState(isPrivateGroup ? room.id : null)");
    expect(sheet).toContain("(Boolean(moimOwnerState.owner) || !moimOwnerState.resolved)");
    expect(sheet).not.toContain("peekMoimRoomOwnerResolved");
  });
});

describe("§5(a) · D-44 나가기 DELETE 대체 경로", () => {
  it("left_at 이 없는 옛 표에서 DELETE 로 넘어갈 때 모임 방이면 거부하고 지우지 않는다", async () => {
    const sb = fakeSb(
      { community_messenger_rooms: [{ owner_domain: "moim" }] },
      { updateError: { message: 'column "left_at" does not exist' } }
    );
    const out = await markParticipantLeft(sb as never, "room-1", "user-1");
    expect(out).toEqual({ ok: false, error: "moim_room_membership_managed_by_moim" });
    expect(sb.calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("모임 방이 아니면 예전처럼 DELETE 로 나간다", async () => {
    const sb = fakeSb(
      { community_messenger_rooms: [{ owner_domain: null }] },
      { updateError: { message: 'column "left_at" does not exist' } }
    );
    expect(await markParticipantLeft(sb as never, "room-1", "user-1")).toEqual({ ok: true });
    expect(sb.calls.some((c) => c.op === "delete" && c.table === "community_messenger_participants")).toBe(true);
  });

  it("leaveCommunityMessengerRoom DELETE 경로도 모임 방을 거부한다 (구조 확인)", () => {
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    const start = svc.indexOf("export async function leaveCommunityMessengerRoom");
    const block = svc.slice(start, start + 2200);
    expect(block).toContain('.select("id, room_type, owner_user_id, owner_domain")');
    const guard = block.indexOf('if (trimText(room.owner_domain) === "moim") return { ok: false, error: "moim_room_membership_managed_by_moim" };');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(block.indexOf(".delete()"));
  });
});

describe("§5(b)① 모임 방 멤버 부제 = 모임 프로필만 (구조 확인)", () => {
  it("모임 소유 방이면 메신저 기본 부제(공개 ID)로 대신 채우지 않는다", () => {
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(svc).toContain("subtitle: bio || (moimOwned ? undefined : baseProfile.subtitle),");
    expect(svc).toContain('{ moimOwned: roomMoimOwned }');
    expect(svc).toContain('.select("id, room:community_messenger_rooms(owner_domain)")');
    expect(svc).toContain("mapPageRowsToMembers(pageRows, membersPageMoimOwned)");
  });
});

describe("§5(c) 메신저 어드민 = 모임 방 읽기 전용 거부", () => {
  it("모임 방 readonly_off 는 갱신 없이 안내 코드로 거부한다", async () => {
    const sb = fakeSb({ community_messenger_rooms: [{ id: "r1", owner_domain: "moim", room_status: "active", is_readonly: true }] });
    const out = await runCmRoomActionCas(sb as never, new Request("https://x.test"), {
      roomId: "r1",
      adminUserId: "a1",
      action: "readonly_off",
      reason: "test reason",
    });
    expect(out).toEqual({ ok: false, error: MOIM_ROOM_READONLY_MANAGED_BY_MOIM, status: 422 });
    expect(sb.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("모임 방이 아니면 그대로 갱신, 모임 방의 읽기 전용이 아닌 조치(차단)도 그대로", async () => {
    const plain = fakeSb({ community_messenger_rooms: [{ id: "r1", owner_domain: null, room_status: "active", is_readonly: true }] });
    expect(
      await runCmRoomActionCas(plain as never, new Request("https://x.test"), { roomId: "r1", adminUserId: "a1", action: "readonly_off", reason: "ok ok" })
    ).toEqual({ ok: true });
    expect(rejectsMoimRoomReadonlyAction({ owner_domain: "moim" }, "block_room")).toBe(false);
    expect(rejectsMoimRoomReadonlyAction({ owner_domain: "moim" }, "readonly_on")).toBe(true);
  });

  it("어드민 안내 문구는 ko·en 키, 세 경로가 같은 거부를 쓴다 (구조 확인)", () => {
    expect(translate("ko", "admin_cm_moim_room_readonly_managed_by_moim")).toContain("모임 어드민");
    expect(translate("en", "admin_cm_moim_room_readonly_managed_by_moim")).toContain("Groups admin");
    const svc = readFileSync("lib/admin-community-messenger/service.ts", "utf8");
    const cmRoute = readFileSync("app/api/admin/community-messenger/rooms/[id]/action/route.ts", "utf8");
    const chatRoute = readFileSync("app/api/admin/chat/rooms/[id]/action/route.ts", "utf8");
    expect(svc).toContain("rejectsMoimRoomReadonlyAction(");
    expect(cmRoute).toContain("MOIM_ROOM_READONLY_MANAGED_BY_MOIM_MESSAGE_KEY");
    expect(chatRoute).toContain("MOIM_ROOM_READONLY_MANAGED_BY_MOIM_MESSAGE_KEY");
  });
});
