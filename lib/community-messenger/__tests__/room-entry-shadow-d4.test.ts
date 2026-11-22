import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/** D4 ②③ 1단계 — 방 진입·이어받기 DB 함수 1번 호출 그림자 비교. 응답 불변. */
beforeAll(() => {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
  (globalThis as { __samarketRoomEntryShadowAls?: unknown }).__samarketRoomEntryShadowAls = undefined;
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("D4 ② 방 진입 원본 기록·비교", () => {
  it("표본 범위 안에서만 기록하고 await 를 넘어 유지된다", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    m.recordRoomEntryShadowAccess("r1", { a: 1 }); // 범위 밖 — 버려짐
    const cap = m.newRoomEntryShadowCapture();
    await m.runWithRoomEntryShadowCapture(cap, async () => {
      await Promise.resolve();
      m.recordRoomEntryShadowAccess("r1", { room_exists: true });
      m.recordRoomEntryShadowSnapshot("u1", "r1", 24, { room: { id: "r1" }, updated_at: "t1" });
      m.recordRoomEntryShadowPairFacts("p1", { saved_by_viewer: true });
    });
    expect(cap.accessByRoomKey.get("r1")).toEqual({ room_exists: true });
    expect(cap.snapshot?.messageLimit).toBe(24);
    expect(cap.pairFactsByPeer.size).toBe(1);
  });

  it("같으면 불일치 없음 — 스냅샷 updated_at·키 순서는 무시", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    const cap = m.newRoomEntryShadowCapture();
    cap.accessByRoomKey.set("r1", { room_exists: true, banned: false });
    cap.snapshot = { userId: "u1", roomId: "r1", messageLimit: 24, data: { room: { id: "r1", t: 1 }, updated_at: "a" } };
    cap.pairFactsByPeer.set("p1", { x: 1 });
    const d = m.diffRoomEntryShadow(cap, {
      access: { banned: false, room_exists: true },
      snapshot: { updated_at: "b", room: { t: 1, id: "r1" } },
      pair_facts_by_peer: { p1: { x: 1 } },
    });
    expect(d.compared).toEqual(["access", "snapshot", "pair_facts"]);
    expect(d.mismatched).toEqual([]);
  });

  it("다르면 항목 이름을 남긴다 · 그룹은 id 집합으로 비교", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    const cap = m.newRoomEntryShadowCapture();
    cap.snapshot = { userId: "u1", roomId: "r1", messageLimit: 24, data: { room: { id: "r1" } } };
    cap.group = { activeUserIds: ["b", "a"], bannedUserIds: [], presenceUserIds: ["a"] };
    const d = m.diffRoomEntryShadow(cap, {
      snapshot: { room: { id: "r2" } },
      group_online: { active_user_ids: ["a", "b"], banned_user_ids: [], presence_rows: [{ user_id: "b" }] },
    });
    expect(d.mismatched).toEqual(["snapshot", "group_presence_users"]);
  });

  it("비교 RPC 오류(마이그레이션 전)·스냅샷 미기록이면 조용히 건너뛴다", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    const cap = m.newRoomEntryShadowCapture();
    const rpc = vi.fn(async () => ({ data: null, error: { message: "function does not exist" } }));
    expect(await m.runRoomEntryShadowCompare({ rpc }, cap)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    cap.snapshot = { userId: "u1", roomId: "r1", messageLimit: 24, data: {} };
    expect(await m.runRoomEntryShadowCompare({ rpc }, cap)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("community_messenger_room_entry", {
      p_user_id: "u1",
      p_room_key: "r1",
      p_message_limit: 24,
    });
  });

  it("비율: 기본 10%, 환경값 0~1", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    expect(m.resolveRoomEntryShadowRate({} as NodeJS.ProcessEnv)).toBe(0.1);
    expect(m.resolveRoomEntryShadowRate({ SAMARKET_ROOM_ENTRY_SHADOW_RATE: "0" } as NodeJS.ProcessEnv)).toBe(0);
    expect(m.shouldSampleRoomEntryShadow(0.1, () => 0.5)).toBe(false);
    expect(m.shouldSampleRoomEntryShadow(0.1, () => 0.05)).toBe(true);
  });
});

describe("D4 ③ 이어받기 결과 비교", () => {
  it("목록·hasMore 가 같으면 match", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-shadow");
    const old = { messages: [{ id: "1", a: 1 }], hasMore: false };
    expect(m.diffMessagesAfterShadow(old, { ok: true, messages: [{ a: 1, id: "1" }], hasMore: false }).match).toBe(true);
    expect(m.diffMessagesAfterShadow(old, { ok: true, messages: [], hasMore: false }).reason).toBe("count");
    expect(m.diffMessagesAfterShadow(old, { ok: false, error: "load_failed" }).reason).toBe("next_error:load_failed");
  });
});

describe("D4 계약 — 응답 불변 · 기존 함수 재사용", () => {
  it("2단계: bootstrap critical 은 방 진입 DB 함수 1번을 미리 받아 같은 요청의 호출 지점이 사용", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts");
    expect(src).toContain("enterRoomEntryPrefetch(");
    expect(src).toContain("await loadRoomEntryPrefetch(tryCreateSupabaseServiceClient(), auth.userId, rawRouteRoomId, limit0)");
    expect(src.indexOf("enterRoomEntryPrefetch(")).toBeLessThan(src.indexOf("messengerRoomCanonicalOrJsonError(auth.userId, rawRouteRoomId)"));
  });

  it("2단계: messages?after 는 DB 함수 먼저, 오류면 기존 경로 · 감시는 2026-11-22 퇴역", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    expect(src).toContain("const viaPage = await cm.listCommunityMessengerRoomMessagesAfterViaPageRpc(afterInput);");
    expect(src).toContain("return cm.listCommunityMessengerRoomMessagesAfter({ ...afterInput, _perf: afterPerf });");
    expect(src).not.toContain("diffMessagesAfterShadow(");
  });

  it("2단계: 호출 지점 4곳이 미리 받은 값을 먼저 본다(없으면 기존 조회)", () => {
    expect(read("lib/community-messenger/server/messenger-room-access.ts")).toContain("takePrefetchedRoomAccess(uid, rid)");
    expect(read("lib/community-messenger/room-bootstrap-snapshot.ts")).toContain("takePrefetchedRoomSnapshot(userId.trim(), roomId.trim(), messageLimit)");
    expect(read("lib/community-messenger/server/direct-pair-facts.ts")).toContain("takePrefetchedPairFacts(viewer, peer, room)");
    expect(read("lib/community-messenger/group/group-room-online-authority.ts")).toContain("takePrefetchedGroupOnline(rid)");
    expect(read("lib/community-messenger/group/group-room-repository.ts")).toContain("takePrefetchedGroupOnline(rid)");
  });

  it("원본 기록 지점 4곳", () => {
    expect(read("lib/community-messenger/server/messenger-room-access.ts")).toContain("recordRoomEntryShadowAccess(rid, data)");
    expect(read("lib/community-messenger/room-bootstrap-snapshot.ts")).toContain('if (snapshotTier === "critical") recordRoomEntryShadowSnapshot(');
    expect(read("lib/community-messenger/server/direct-pair-facts.ts")).toContain("if (room) recordRoomEntryShadowPairFacts(peer, data)");
    expect(read("lib/community-messenger/group/group-room-online-authority.ts")).toContain("recordRoomEntryShadowGroup({");
  });

  it("마이그레이션은 기존 함수를 안에서 부르고 service_role 만 실행", () => {
    const sql = read("supabase/migrations/20271119170000_cm_room_entry_and_messages_after_page.sql");
    for (const fn of [
      "public.community_messenger_room_access(p_user_id, p_room_key)",
      "public.get_community_messenger_room_bootstrap_snapshot(",
      "public.community_messenger_direct_pair_facts(p_user_id, x.user_id, p_room_key)",
      "public.community_messenger_room_messages_after(p_user_id, p_room_id, p_after_message_id, p_limit)",
    ]) {
      expect(sql).toContain(fn);
    }
    expect(sql).toContain("grant execute on function public.community_messenger_room_entry(uuid, text, integer) to service_role;");
    expect(sql).toContain(
      "grant execute on function public.community_messenger_room_messages_after_page(uuid, uuid, uuid, integer) to service_role;"
    );
    expect(sql).not.toMatch(/to (anon|authenticated)\b/);
  });
});

describe("D4 2단계 미리 받은 값", () => {
  it("메시지 수는 DB 함수와 같은 규칙(1~30)으로 맞을 때만 스냅샷 사용 · 사용자·방이 다르면 사용 안 함", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-prefetch");
    expect(m.clampRoomSnapshotMessageLimit(50)).toBe(30);
    expect(m.clampRoomSnapshotMessageLimit(0)).toBe(1);
    const p = {
      userId: "u1",
      roomKey: "r1",
      messageLimitClamped: 24,
      entry: {
        access: { room_exists: true },
        snapshot: { room: { id: "r1" } },
        pair_facts_by_peer: { p1: { saved_by_viewer: true } },
        group_online: { active_user_ids: ["a", "b"], banned_user_ids: [], presence_rows: [] },
      },
    };
    await m.runWithRoomEntryPrefetch(p, async () => {
      await Promise.resolve();
      expect(m.takePrefetchedRoomAccess("u1", "r1")).toEqual({ room_exists: true });
      expect(m.takePrefetchedRoomAccess("u2", "r1")).toBeUndefined();
      expect(m.takePrefetchedRoomSnapshot("u1", "r1", 24)).toEqual({ room: { id: "r1" } });
      expect(m.takePrefetchedRoomSnapshot("u1", "r1", 20)).toBeUndefined();
      expect(m.takePrefetchedPairFacts("u1", "p1", "r1")).toEqual({ saved_by_viewer: true });
      expect(m.takePrefetchedPairFacts("u1", "p9", "r1")).toBeUndefined();
      expect(m.takePrefetchedGroupOnline("r1")?.activeUserIds).toEqual(["a", "b"]);
    });
    expect(m.takePrefetchedRoomAccess("u1", "r1")).toBeUndefined();
  });

  it("uuid 방 키가 아니거나 함수 오류면 null(기존 경로)", async () => {
    const m = await import("@/lib/community-messenger/server/room-entry-prefetch");
    const rpc = async () => ({ data: null, error: { message: "x" } });
    expect(await m.loadRoomEntryPrefetch({ rpc }, "u1", "not-uuid", 24)).toBeNull();
    expect(await m.loadRoomEntryPrefetch({ rpc }, "u1", "11111111-1111-1111-1111-111111111111", 24)).toBeNull();
  });
});
