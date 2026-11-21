/**
 * 2026-11-21 보내기 1단계 — 받는 사람 수에 비례하던 판정 읽기 묶기 · 그룹방 낭비 조회 제거.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-design-2026-11-21.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadNotifyRecipientFactsBatch } from "@/lib/notifications/pipeline/notify-recipient-facts-batch";
import { assertActiveGroupMembershipIfGroup } from "@/lib/community-messenger/group/group-active-membership-gate";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Res = { data: unknown; error: unknown };
/** 표별로 결과를 주는 가짜 클라이언트 — 체인 메서드는 모두 자신을 돌려주고 await 하면 결과 */
function fakeSb(byTable: Record<string, Res>) {
  const calls: string[] = [];
  const from = vi.fn((table: string) => {
    calls.push(table);
    const res = byTable[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "not", "order", "is", "limit"]) chain[m] = () => chain;
    chain.then = (ok: (v: Res) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad);
    return chain;
  });
  return { sb: { from } as never, calls };
}

const S = "11111111-1111-1111-1111-111111111111";
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("④ 받는 사람 판정 묶음 읽기", () => {
  it("받는 사람이 몇 명이든 표 4개를 1번씩만 읽는다", async () => {
    const { sb, calls } = fakeSb({});
    await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A, B, C] });
    expect(calls.sort()).toEqual(
      ["community_messenger_participants", "user_devices", "user_settings", "user_social_relations"].sort()
    );
  });

  it("차단: 양방향 활성 blocked 행만 · 비활성(false)은 제외 · null 은 예전 활성", async () => {
    const { sb } = fakeSb({
      user_social_relations: {
        data: [
          { owner_user_id: S, target_user_id: A, relation_type: "blocked", is_active: true },
          { owner_user_id: B, target_user_id: S, relation_type: "blocked", is_active: null },
          { owner_user_id: C, target_user_id: S, relation_type: "blocked", is_active: false },
        ],
        error: null,
      },
    });
    const f = await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A, B, C] });
    expect([...f!.blocked].sort()).toEqual([A, B].sort());
  });

  it("차단을 이미 확인한 1:1 상대만 있으면 관계 표를 읽지 않는다", async () => {
    const { sb, calls } = fakeSb({});
    await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A], blockClearedUserId: A });
    expect(calls).not.toContain("user_social_relations");
  });

  it("음소거: 행이 정확히 1개이고 is_muted=true 일 때만(기존 maybeSingle 과 같음)", async () => {
    const { sb } = fakeSb({
      community_messenger_participants: {
        data: [
          { user_id: A, is_muted: true },
          { user_id: B, is_muted: false },
          { user_id: C, is_muted: true },
          { user_id: C, is_muted: true },
        ],
        error: null,
      },
    });
    const f = await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A, B, C] });
    expect([...f!.muted]).toEqual([A]);
  });

  it("언어: 계정 명시값 → 최근 기기(첫 행) → en", async () => {
    const { sb } = fakeSb({
      user_settings: { data: [{ user_id: A, preferred_language: "ko" }], error: null },
      user_devices: {
        data: [
          { user_id: B, app_language: "ko" },
          { user_id: B, app_language: "en" },
          { user_id: A, app_language: "en" },
        ],
        error: null,
      },
    });
    const f = await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A, B, C] });
    expect(f!.language.get(A)).toBe("ko");
    expect(f!.language.get(B)).toBe("ko");
    expect(f!.language.get(C)).toBe("en");
  });

  it("어느 하나라도 읽기 오류면 null(기존 받는 사람별 경로)", async () => {
    const { sb } = fakeSb({ user_devices: { data: null, error: { message: "x" } } });
    expect(await loadNotifyRecipientFactsBatch(sb, { roomId: "r", senderUserId: S, recipientUserIds: [A] })).toBeNull();
  });

  it("파이프라인은 묶음 결과가 있으면 받는 사람별 조회를 하지 않고, 없으면 기존 경로", () => {
    const src = read("lib/notifications/pipeline/notify-message-pipeline.ts");
    const batch = src.indexOf("if (batchFacts) {");
    const legacy = src.indexOf("} else if (parallelRecipients) {");
    expect(batch).toBeGreaterThan(0);
    expect(legacy).toBeGreaterThan(batch);
  });
});

describe("② 그룹 게이트 — 방 권한 RPC 결과 재사용", () => {
  const sb = { from: vi.fn() } as never;

  it("미리 받은 값이 있으면 강퇴·참가 표를 읽지 않는다", async () => {
    const participant = { id: "p", room_id: "r", user_id: A, role: "member" } as never;
    const ok = await assertActiveGroupMembershipIfGroup({
      userId: A,
      roomId: "r",
      supabase: sb,
      roomType: "private_group",
      prefetchedAccess: { banned: false, groupParticipant: participant },
    });
    expect(ok).toMatchObject({ ok: true, skipped: false });
    expect((sb as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("강퇴면 USER_BANNED · 참가 행 없으면 FORBIDDEN (기존과 같은 오류)", async () => {
    const banned = await assertActiveGroupMembershipIfGroup({
      userId: A,
      roomId: "r",
      supabase: sb,
      roomType: "private_group",
      prefetchedAccess: { banned: true, groupParticipant: null },
    });
    expect(banned.ok).toBe(false);
    const gone = await assertActiveGroupMembershipIfGroup({
      userId: A,
      roomId: "r",
      supabase: sb,
      roomType: "open_group",
      prefetchedAccess: { banned: false, groupParticipant: null },
    });
    expect(gone.ok).toBe(false);
    expect(banned).not.toEqual(gone);
  });
});

describe("①③ 그룹방 낭비 조회 제거", () => {
  it("보내기 route: 그룹방이면 1:1 차단 게이트를 부르지 않고 그룹 게이트에 권한 결과를 넘긴다", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    expect(src).toContain('const isGroupHint = roomTypeHint === "private_group" || roomTypeHint === "open_group";');
    expect(src).toContain("? Promise.resolve({ ok: true as const, peerUserId: null })");
    expect(src).toContain("prefetchedAccess: groupPrefetchedAccess,");
  });

  it("1:1 차단 게이트는 그룹방이면 항상 통과(첫 규칙) — 건너뛰어도 결과 같음", () => {
    const gate = read("lib/community-messenger/server/community-direct-social-block-gate.ts");
    expect(gate).toContain('if (roomType === "private_group" || roomType === "open_group") return false;');
  });

  it("대상 bump: 알려진 그룹방이면 쓰지 않는 참가자 목록을 읽지 않는다", () => {
    const src = read("lib/notifications/notification-target-messenger-bridge.ts");
    expect(src).toContain(": useKnown && knownIsGroup");
  });
});
