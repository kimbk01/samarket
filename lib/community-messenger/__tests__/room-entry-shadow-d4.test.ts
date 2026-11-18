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
  it("bootstrap 은 기존 처리 결과를 그대로 돌려주고 비교는 응답 뒤", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts");
    expect(src).toContain("runWithRoomEntryShadowCapture(capture, () => handleRoomBootstrapGet(req, ctx))");
    expect(src).toMatch(/after\(async \(\) => \{\s*await runRoomEntryShadowCompare/);
  });

  it("messages?after 는 기존 결과로 응답하고 새 경로는 afterResponse 안에서만", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    const i = src.indexOf("listCommunityMessengerRoomMessagesAfterViaPageRpc");
    expect(i).toBeGreaterThan(src.indexOf("afterResponse(async () => {"));
    expect(src).toContain('return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "after" as const });');
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
