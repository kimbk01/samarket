import "@/lib/i18n/admin-catalog";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 R5 어드민 (작업자 A) — 설계 docs/audit/moim-r5-design-2026-11-28/D-admin.md · INTEGRATED.md §A-3·§B·§D-2.
 * 행동 시험은 고치기 전 코드에서 실패하고 고친 뒤 통과한다. 문자열만 보는 시험은 「구조 확인」이라고 적는다.
 */

// ── 가짜 supabase: 모든 체인 호출을 기록하고 테이블별 결과를 돌려준다 ─────────────────
type Call = { table: string; ops: [string, unknown[]][] };
function fakeSb(tables: Record<string, (call: Call) => { data: unknown; error?: unknown; count?: number | null }>) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: { ok: true } as { ok: boolean } | null, error: null as unknown }));
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const result = () => {
      const r = (tables[table] ?? (() => ({ data: [] })))(call);
      return { data: r.data, error: r.error ?? null, count: r.count ?? null };
    };
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err);
          if (prop === "maybeSingle" || prop === "single") {
            return () => {
              call.ops.push([prop, []]);
              const r = result();
              return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
            };
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, args]);
            return builder;
          };
        },
      }
    );
    return builder;
  };
  return { sb: { from, rpc }, calls, rpc };
}
const has = (c: Call, op: string, ...args: unknown[]) => c.ops.some(([o, a]) => o === op && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)));

vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-community-messenger/sync-room-after-admin-hide", () => ({ syncRoomAfterAdminMessageVisibility: vi.fn(async () => undefined) }));

import { translate } from "@/lib/i18n/messages";
import {
  MOIM_EVENT_TYPES,
  moimAdminAllowedActions,
  moimAdminHttpStatus,
  moimSanctionFollowUpHref,
  moimSanctionRowView,
  parseMoimAdminPolicyRows,
} from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminFailureKind, moimAdminFailureText } from "@/lib/admin/moim/moim-admin-errors";
import { moimAdminRpcResponse } from "@/lib/admin/moim/moim-admin-route.server";
import { rejectsMoimRoomAdminAction, MOIM_ROOM_MANAGED_BY_MOIM } from "@/lib/admin-community-messenger/moim-room-admin-guard";
import { runCmMessageHiddenCas, runCmReportActionCas, runCmRoomActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";
import { groupAdminMoimReports, listAdminMoimSanctions, loadAdminMoimReportDetail, loadAdminMoimSection } from "@/lib/admin/moim/moim-admin-queries.server";

const tk = (key: string, vars?: Record<string, string | number>) => translate("ko", key as never, vars);

describe("D §1-1 어드민 오류 번호표·문구", () => {
  it("상태 때문에 못 하는 조치는 422 (예전: moim_closed·moim_deleted = 400 → 시트가 「입력 오류」로 보였다)", async () => {
    for (const code of ["moim_closed", "moim_deleted", "moim_sanction_not_revocable", "moim_sanction_already_active", "moim_report_link_invalid", "moim_content_author_deleted"]) {
      const res = moimAdminRpcResponse({ ok: false, error: code });
      expect(res.status, code).toBe(422);
    }
  });
  it("404 는 행이 정말 없음만 — moim_schedule_request_not_found 처럼 「이미 처리됨」은 400 (예전: *_not_found 전부 404)", () => {
    expect(moimAdminRpcResponse({ ok: false, error: "moim_sanction_not_found" }).status).toBe(404);
    expect(moimAdminRpcResponse({ ok: false, error: "moim_schedule_request_not_found" }).status).toBe(400);
    expect(moimAdminHttpStatus("moim_conflict")).toBe(409);
    expect(moimAdminHttpStatus("moim_unknown")).toBe(500);
  });
  it("실패 문구에 원래 코드 글자가 없다 (D12)", () => {
    for (const f of [
      { status: 400, code: "invalid_request" },
      { status: 500, code: "http_500" },
      { status: 0, code: "network_error" },
      { status: 422, code: "moim_closed" },
    ]) {
      const text = moimAdminFailureText(tk, f);
      expect(text).not.toContain(f.code);
      expect(text.length).toBeGreaterThan(0);
    }
    expect(moimAdminFailureText(tk, { status: 422, code: "moim_closed" })).toBe(tk("moim_err_moim_closed"));
    expect(moimAdminFailureText(tk, { status: 0, code: "network_error" })).toBe(tk("admin_moim_err_network"));
    expect(moimAdminFailureKind({ status: 409 })).toBe("stale");
    expect(moimAdminFailureKind({ status: 404 })).toBe("gone");
    expect(moimAdminFailureKind({ status: 422 })).toBe("refused");
  });
});

describe("D §1-2 모임 상태 → 어드민 조치 (D4·D10·D11)", () => {
  it("종료 = 역할·모임장 지정만 불가 · 삭제 = 이용 제한·기각만", () => {
    expect(moimAdminAllowedActions("active")).toMatchObject({ roleAndHost: true, members: true, content: true, sanctions: true, reportContentOrMoim: true });
    expect(moimAdminAllowedActions("closed")).toMatchObject({ roleAndHost: false, members: true, content: true, sanctions: true, reportContentOrMoim: true });
    expect(moimAdminAllowedActions("deleted")).toEqual({
      roleAndHost: false,
      members: false,
      content: false,
      sanctions: false,
      editInfo: false,
      reportContentOrMoim: false,
      reportRestrictOrDismiss: true,
    });
  });
});

describe("D §1-3 제재 행 보기 (D1·D2·신규2 · 리드 결정 1)", () => {
  const base = { target_id: "t1", level: "warn", revoked_at: null, ends_at: null };
  it("「해제」는 진행 중인 모임 단위 행에만 · 삭제 모임이면 없음", () => {
    expect(moimSanctionRowView({ ...base, target_kind: "moim", live_state: "active" }, "active").revocable).toBe(true);
    expect(moimSanctionRowView({ ...base, target_kind: "moim", live_state: "active" }, "deleted").revocable).toBe(false);
    expect(moimSanctionRowView({ ...base, target_kind: "content", level: "content_hide", live_state: "active", report_target_type: "post" }, "active")).toMatchObject({
      kind: "content",
      revocable: false,
      followUp: "content_posts",
    });
    expect(moimSanctionRowView({ ...base, target_kind: "member", level: "user_restrict", live_state: "active" }, "active")).toMatchObject({
      kind: "user",
      revocable: false,
      followUp: "user_restrictions",
    });
  });
  it("상태는 뷰의 지금 상태 — 복구된 콘텐츠 = lifted · 커뮤니티에서 푼 제한 = revoked · 연결 없는 옛 행 = 시간 기준", () => {
    expect(moimSanctionRowView({ ...base, target_kind: "content", level: "content_hide", live_state: "lifted" }, "active").state).toBe("lifted");
    expect(moimSanctionRowView({ ...base, target_kind: "member", level: "user_restrict", live_state: "revoked" }, "active").state).toBe("revoked");
    expect(moimSanctionRowView({ ...base, target_kind: "member", level: "user_restrict", live_state: "unlinked", ends_at: "2000-01-01T00:00:00Z" }, "active").state).toBe("expired");
  });
  it("후속 링크 — 이용 제한은 회원 활동 제한(userId·sanctionId) · 사진은 앨범 탭 · 일정은 링크 없음", () => {
    const user = moimSanctionRowView({ ...base, target_kind: "member", level: "user_restrict", live_state: "active" }, "active");
    expect(moimSanctionFollowUpHref(user, { target_id: "u1", community_sanction_id: "cs1" }, { moimId: "m1" })).toBe("/admin/community/restrictions?userId=u1&sanctionId=cs1");
    const album = moimSanctionRowView({ ...base, target_kind: "content", level: "content_hide", live_state: "active", report_target_type: "album" }, "active");
    expect(moimSanctionFollowUpHref(album, { target_id: "a1" }, { moimId: "m1" })).toBe("/admin/community/moims/m1?tab=album");
    const sch = moimSanctionRowView({ ...base, target_kind: "content", level: "content_hide", live_state: "active", report_target_type: "schedule" }, "active");
    expect(moimSanctionFollowUpHref(sch, { target_id: "s1" }, { moimId: "m1" })).toBeNull();
  });
});

describe("D20 정책 영어 이름 필수", () => {
  it("영어 이름이 비면 저장 불가 (예전: 0~80자 허용 → 영어 화면에 코드)", () => {
    expect(parseMoimAdminPolicyRows([{ code: "spam", label_ko: "스팸", label_en: "" }], "prohibited_types")).toBeNull();
    expect(parseMoimAdminPolicyRows([{ code: "spam", label_ko: "스팸", label_en: "Spam" }], "prohibited_types")).not.toBeNull();
  });
});

describe("D5 메신저 어드민 — 모임 방 차단·보관·읽기 전용 거부", () => {
  it("가드: 모임 방이면 6개 동작 모두 거부, 일반 방은 통과", () => {
    for (const a of ["block_room", "unblock_room", "archive_room", "unarchive_room", "readonly_on", "readonly_off"]) {
      expect(rejectsMoimRoomAdminAction({ owner_domain: "moim" }, a), a).toBe(true);
      expect(rejectsMoimRoomAdminAction({ owner_domain: null }, a), a).toBe(false);
    }
  });
  it("방 조치 CAS: 모임 방 block_room → 422, 갱신 0 (예전: 그대로 차단됨)", async () => {
    const f = fakeSb({ community_messenger_rooms: () => ({ data: [{ id: "r1", owner_domain: "moim", room_status: "active", is_readonly: false }] }) });
    const out = await runCmRoomActionCas(f.sb as never, new Request("https://x.test"), { roomId: "r1", adminUserId: "a1", action: "block_room", reason: "test reason" });
    expect(out).toEqual({ ok: false, error: MOIM_ROOM_MANAGED_BY_MOIM, status: 422 });
    expect(f.calls.some((c) => c.ops.some(([o]) => o === "update"))).toBe(false);
  });
  it("신고 경유: 모임 방 sanction_room_block → 422, 신고 상태 그대로 (예전: 신고만 「제재」로 닫힘)", async () => {
    const f = fakeSb({
      community_messenger_reports: () => ({ data: [{ id: "rep1", report_type: "room", room_id: "r1", message_id: null, status: "received" }] }),
      community_messenger_rooms: () => ({ data: [{ id: "r1", owner_domain: "moim" }] }),
    });
    const out = await runCmReportActionCas(f.sb as never, new Request("https://x.test"), { reportId: "rep1", adminUserId: "a1", action: "sanction_room_block", reason: "test reason" });
    expect(out).toMatchObject({ ok: false, error: MOIM_ROOM_MANAGED_BY_MOIM, status: 422 });
    expect(f.calls.some((c) => c.table === "community_messenger_reports" && c.ops.some(([o]) => o === "update"))).toBe(false);
  });
});

describe("D23 메신저 메시지 숨김 → 모임 운영기록", () => {
  const make = (ownerDomain: string | null) =>
    fakeSb({
      community_messenger_messages: () => ({ data: [{ id: "msg1" }] }),
      community_messenger_rooms: () => ({ data: [{ owner_domain: ownerDomain }] }),
    });
  it("모임 방이면 moim_admin_log_room_action 1회, 일반 방이면 0회", async () => {
    const moim = make("moim");
    await runCmMessageHiddenCas(moim.sb as never, new Request("https://x.test"), { roomId: "r1", messageId: "msg1", adminUserId: "a1", hidden: true, reason: "rr" });
    expect(moim.rpc).toHaveBeenCalledTimes(1);
    expect(moim.rpc.mock.calls[0]?.[0]).toBe("moim_admin_log_room_action");
    expect(moim.rpc.mock.calls[0]?.[1]).toMatchObject({ p_type: "admin_messenger_message_hidden", p_room: "r1", p_target: "msg1", p_reason: "rr" });
    const plain = make(null);
    await runCmMessageHiddenCas(plain.sb as never, new Request("https://x.test"), { roomId: "r1", messageId: "msg1", adminUserId: "a1", hidden: false, reason: "rr" });
    expect(plain.rpc).not.toHaveBeenCalled();
  });
  it("기록 RPC 가 실패해도 숨김 결과는 성공", async () => {
    const f = make("moim");
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const out = await runCmMessageHiddenCas(f.sb as never, new Request("https://x.test"), { roomId: "r1", messageId: "msg1", adminUserId: "a1", hidden: true, reason: "rr" });
    expect(out).toEqual({ ok: true });
  });
});

describe("어드민 읽기 쿼리 (D2·D15·D25·신규1·신규3·E1·D17)", () => {
  it("D2 제재 이력: 표가 아니라 뷰 · 대상 종류 user = host·member · 회원 필터", async () => {
    const f = fakeSb({ moim_admin_sanction_rows_v: () => ({ data: [], count: 0 }) });
    await listAdminMoimSanctions(f.sb as never, { filter: "all", kind: "user", moimId: null, userId: "u1", limit: 50, offset: 0 });
    const c = f.calls.find((x) => x.table === "moim_admin_sanction_rows_v")!;
    expect(c).toBeTruthy();
    expect(has(c, "in", "target_kind", ["host", "member"])).toBe(true);
    expect(has(c, "eq", "target_id", "u1")).toBe(true);
    expect(f.calls.some((x) => x.table === "moim_sanctions")).toBe(false);
    /** 예전 고정 조건 target_kind='moim' 이 없다 */
    expect(has(c, "eq", "target_kind", "moim")).toBe(false);
  });
  it("D15 연결할 신고 = 처리 전만 (open=1)", async () => {
    const f = fakeSb({ moim_reports: () => ({ data: [], count: 0 }) });
    await loadAdminMoimSection(f.sb as never, "m1", "reports", { limit: 100, offset: 0 }, { open: true });
    expect(has(f.calls.find((x) => x.table === "moim_reports")!, "in", "status", ["received", "reviewing"])).toBe(true);
  });
  it("D25·신규1 비멤버 차단자는 모임 전체 기준 · 다른 쪽에 있는 차단 멤버는 1쪽에 또 나오지 않는다", async () => {
    let memberQuery = 0;
    const f = fakeSb({
      moim_members: () => {
        memberQuery += 1;
        /** 1번째 = 쪽 행(차단 멤버 u2 는 2쪽이라 없음) · 2번째 = 차단 id 로 모임 전체 조회 → u2 는 멤버 */
        return memberQuery === 1 ? { data: [{ user_id: "u1" }], count: 60 } : { data: [{ user_id: "u2" }] };
      },
      moim_bans: () => ({ data: [{ user_id: "u2", reason: null, created_at: "2026-11-01" }, { user_id: "u3", reason: null, created_at: "2026-11-02" }] }),
      profiles: () => ({ data: [] }),
    });
    const res = await loadAdminMoimSection(f.sb as never, "m1", "members", { limit: 50, offset: 0 });
    if (!res.ok) throw new Error("fail");
    expect((res.rows as { user_id: string }[]).map((r) => r.user_id)).toEqual(["u1"]);
    expect((res.bansWithoutMember as { user_id: string }[]).map((r) => r.user_id)).toEqual(["u3"]);
    /** offset 50 에서도 같다 */
    memberQuery = 0;
    const res2 = await loadAdminMoimSection(f.sb as never, "m1", "members", { limit: 50, offset: 50 });
    if (!res2.ok) throw new Error("fail");
    expect((res2.bansWithoutMember as { user_id: string }[]).map((r) => r.user_id)).toEqual(["u3"]);
  });
  it("신규3 묶음 보기에 모임 필터", async () => {
    const f = fakeSb({ moim_reports: () => ({ data: [] }) });
    await groupAdminMoimReports(f.sb as never, { status: null, targetType: null, moimId: "m1", limit: 50, offset: 0 });
    expect(has(f.calls.find((x) => x.table === "moim_reports")!, "eq", "moim_id", "m1")).toBe(true);
  });
  it("D17 신고 없음 코드 = moim_report_not_found · E1 같은 대상 열린 신고 수는 같은 모임만", async () => {
    const none = fakeSb({ moim_reports: () => ({ data: null }) });
    expect(await loadAdminMoimReportDetail(none.sb as never, "r1")).toEqual({ ok: false, error: "moim_report_not_found" });
    const f = fakeSb({
      moim_reports: () => ({ data: [{ id: "r1", reporter_id: "u1", moim_id: "m1", target_type: "post", target_id: "p1", status: "received", action_id: null, handled_by: null }] }),
    });
    await loadAdminMoimReportDetail(f.sb as never, "r1");
    const openSame = f.calls.find((x) => x.table === "moim_reports" && has(x, "in", "status", ["received", "reviewing"]))!;
    expect(has(openSame, "eq", "moim_id", "m1")).toBe(true);
  });
});

describe("D17 운영기록 종류 — 마이그레이션이 남기는 값 ⊂ 상수 · 문구 ko·en (구조 확인)", () => {
  it("moim__log 4번째 · moim__admin_log 3번째 인자의 문자열이 모두 상수에 있다", () => {
    const dir = "supabase/migrations";
    const found = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(`${dir}/${f}`, "utf8");
      for (const m of sql.matchAll(/moim__log\(([^;]*?)\)\s*;/g)) {
        const arg = (m[1] ?? "").split(",")[3] ?? "";
        for (const lit of arg.matchAll(/'([a-z_]+)'/g)) found.add(lit[1]!);
      }
      for (const m of sql.matchAll(/moim__admin_log\(([^;]*?)\)\s*;/g)) {
        const arg = (m[1] ?? "").split(",")[2] ?? "";
        for (const lit of arg.matchAll(/'([a-z_]+)'/g)) found.add(lit[1]!);
      }
    }
    /** 조각 문자열('admin_' || p_type || '_' || p_action)은 상수에 펼쳐 적었다 */
    const pieces = new Set(["admin_", "_", "admin_report_"]);
    const missing = [...found].filter((x) => !pieces.has(x) && !(MOIM_EVENT_TYPES as readonly string[]).includes(x));
    expect(missing).toEqual([]);
  });
  it("INTEGRATED §0-10 의 새 기록 종류 8개가 있고, 모든 종류에 ko·en 문구가 있다", () => {
    for (const x of ["invite_declined", "host_transfer_cancelled", "album_deleted", "comment_deleted", "comment_hidden", "board_reordered", "sanction_dedup", "admin_messenger_message_hidden", "admin_messenger_message_unhidden"]) {
      expect(MOIM_EVENT_TYPES as readonly string[]).toContain(x);
    }
    for (const x of [...MOIM_EVENT_TYPES, "other"]) {
      const key = `admin_moim_event_${x}`;
      expect(translate("ko", key as never), key).not.toBe(key);
      expect(translate("en", key as never), key).not.toBe(key);
    }
  });
});

describe("D8·D27·D5 문구 키 (구조 확인)", () => {
  it("주제 바뀐 항목 · 대상 종류별 이용 제한 이름 · 메신저 모임 방 안내", () => {
    for (const key of [
      "admin_moim_info_field_topicLabel",
      "admin_moim_decide_who_target_member",
      "admin_moim_decide_who_target_chat_message",
      "admin_cm_moim_room_managed_by_moim",
      "admin_cm_moim_room_badge",
      "admin_moim_policy_reasons_need_active",
    ]) {
      expect(translate("ko", key as never), key).not.toBe(key);
      expect(translate("en", key as never), key).not.toBe(key);
    }
  });
});

// ── 라우트 ──────────────────────────────────────────────────────────────────────
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcData: Record<string, unknown> = { ok: true };
const notifyMany = vi.fn(async (..._a: unknown[]) => ({ failed: 0 }));
const routeSb = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: rpcData, error: null };
  },
  from: () => fakeSb({}).sb.from("x"),
};
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "11111111-1111-4111-8111-111111111111", isSuperAdmin: false }, sb: routeSb }),
}));
vi.mock("@/lib/moim/server/moim-notify.server", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-notify.server");
  return {
    ...actual,
    notifyMoimMany: (...a: unknown[]) => notifyMany(...a),
    notifyMoimAfterResponse: (work: () => Promise<unknown>) => {
      void work();
    },
  };
});
vi.mock("@/lib/notifications/notify-community-moderation", () => ({ notifyCommunitySanction: vi.fn(async () => undefined) }));

const RID = "22222222-2222-4222-8222-222222222222";
const MID = "33333333-3333-4333-8333-333333333333";
async function post(mod: { POST: (req: never, ctx: never) => Promise<Response> }, url: string, body: unknown, params: Record<string, string>) {
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return mod.POST(req as never, { params: Promise.resolve(params) } as never);
}

describe("라우트 (D9·D3·D7)", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcData = { ok: true };
    notifyMany.mockClear();
  });

  it("D9 검토 시작: 사유 없으면 400 moim_admin_reason_required, RPC 0 · 사유 있으면 RPC 에 사유", async () => {
    const mod = await import("@/app/api/admin/moim/reports/[reportId]/review/route");
    const bad = await post(mod, `https://x.test/api/admin/moim/reports/${RID}/review`, {}, { reportId: RID });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("moim_admin_reason_required");
    expect(rpcCalls).toHaveLength(0);
    const ok = await post(mod, `https://x.test/api/admin/moim/reports/${RID}/review`, { reason: "검토 시작 사유" }, { reportId: RID });
    expect(ok.status).toBe(200);
    expect(rpcCalls[0]).toMatchObject({ fn: "moim_admin_report_review", args: { p_report: RID, p_reason: "검토 시작 사유" } });
  });

  it("D3 같은 단계 모임 제재가 진행 중(created=false)이면 moim_sanctioned 를 보내지 않는다", async () => {
    rpcData = {
      ok: true,
      status: "actioned",
      moim_id: MID,
      moim_name: "M",
      host_user_id: "h1",
      target_type: "moim",
      target_id: MID,
      target_owner_id: null,
      reporter_ids: ["rep1"],
      reporter_member_ids: [],
      closed_report_ids: [],
      actions: [{ kind: "moim_warn", sanction_id: "s-old", created: false }],
      moim_level: "warn",
      moim_notify_user_ids: ["h1"],
      chat_room_id: null,
      schedule_title: null,
      schedule_notify_user_ids: [],
      moim_status: "active",
      retention_ended_at: null,
    };
    const mod = await import("@/app/api/admin/moim/reports/[reportId]/decision/route");
    const res = await post(
      mod,
      `https://x.test/api/admin/moim/reports/${RID}/decision`,
      { expectedStatus: "reviewing", decision: "actioned", reason: "사유 사유", moimLevel: "warn" },
      { reportId: RID }
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    const kinds = notifyMany.mock.calls.map((c) => (c[2] as { kind: string }).kind);
    expect(kinds).toContain("moim_report_result");
    expect(kinds).not.toContain("moim_sanctioned");
    expect((await res.json()).actions[0]).toMatchObject({ created: false });
  });

  it("D3 새로 만든 제재(키 없음 = 옛 DB 포함)는 보낸다 · E4 비멤버 신고자 + 종료 모임 열람 끝 → 모임 탭으로", async () => {
    rpcData = {
      ok: true,
      status: "actioned",
      moim_id: MID,
      moim_name: "M",
      host_user_id: "h1",
      target_type: "moim",
      target_id: MID,
      reporter_ids: ["rep1", "rep2"],
      reporter_member_ids: ["rep1"],
      closed_report_ids: [],
      actions: [{ kind: "moim_warn", sanction_id: "s-new" }],
      moim_level: "warn",
      moim_notify_user_ids: ["h1"],
      chat_room_id: null,
      schedule_title: null,
      schedule_notify_user_ids: [],
      moim_status: "closed",
      retention_ended_at: "2026-11-01T00:00:00Z",
    };
    const mod = await import("@/app/api/admin/moim/reports/[reportId]/decision/route");
    await post(mod, `https://x.test/api/admin/moim/reports/${RID}/decision`, { expectedStatus: "reviewing", decision: "actioned", reason: "사유 사유", moimLevel: "warn" }, { reportId: RID });
    await new Promise((r) => setTimeout(r, 0));
    const result = notifyMany.mock.calls.filter((c) => (c[2] as { kind: string }).kind === "moim_report_result");
    /** 열람이 끝난 종료 모임 = 멤버도 비멤버도 열 수 없음 → 결과 알림은 모임 탭 */
    expect(result.map((c) => (c[2] as { linkUrl: string }).linkUrl)).toEqual(["/moim", "/moim"]);
    /** 멤버도 열 수 없는 모임이면 제재 알림은 보내지 않는다 */
    expect(notifyMany.mock.calls.some((c) => (c[2] as { kind: string }).kind === "moim_sanctioned")).toBe(false);
  });

  it("E18 종료 모임(열람 기간 안) 콘텐츠 숨김 — 모임장 제재 알림은 보내지 않고 작성자 조치 알림은 보낸다 (R5 재감사 F7)", async () => {
    rpcData = {
      ok: true,
      status: "actioned",
      moim_id: MID,
      moim_name: "M",
      host_user_id: "h1",
      target_type: "post",
      target_id: "p1",
      target_owner_id: "u9",
      reporter_ids: [],
      reporter_member_ids: [],
      closed_report_ids: [],
      actions: [{ kind: "content_hide", sanction_id: "s-h", changed: true }],
      moim_level: null,
      moim_notify_user_ids: [],
      chat_room_id: null,
      schedule_title: null,
      schedule_notify_user_ids: [],
      moim_status: "closed",
      retention_ended_at: null,
    };
    const mod = await import("@/app/api/admin/moim/reports/[reportId]/decision/route");
    await post(mod, `https://x.test/api/admin/moim/reports/${RID}/decision`, { expectedStatus: "reviewing", decision: "actioned", reason: "사유 사유", contentHide: true }, { reportId: RID });
    await new Promise((r) => setTimeout(r, 0));
    const kinds = notifyMany.mock.calls.map((c) => (c[2] as { kind: string }).kind);
    expect(kinds).not.toContain("moim_sanctioned");
    expect(kinds).toContain("moim_content_moderated");
  });

  it("D7 동네 코드가 사전에 없으면 400 moim_region_invalid, RPC 0", async () => {
    const mod = await import("@/app/api/admin/moim/moims/[moimId]/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(`https://x.test/api/admin/moim/moims/${MID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { lguId: "abc" }, expectedUpdatedAt: "2026-11-01T00:00:00Z", reason: "동네 수정" }),
    });
    const res = await mod.PATCH(req as never, { params: Promise.resolve({ moimId: MID }) } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("moim_region_invalid");
    expect(rpcCalls).toHaveLength(0);
  });
});
