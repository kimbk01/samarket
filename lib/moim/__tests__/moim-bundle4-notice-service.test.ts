import { describe, expect, it, vi } from "vitest";

/**
 * 모임 4번 묶음 D1 — 모임 방에서는 메신저 방 공지 저장을 거부한다 (동작 시험, 재감사 반영).
 * 모임 방이면 갱신 쿼리 없이 moim_room_settings_managed_by_moim. 일반 그룹 방은 그대로 저장.
 */

const updates: Array<Record<string, unknown>> = [];
let roomRow: Record<string, unknown> = {};

function fakeSb() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: table === "community_messenger_rooms" ? roomRow : table === "community_messenger_participants" ? { role: "owner" } : null,
        error: null,
      });
      chain.update = (patch: Record<string, unknown>) => {
        updates.push({ table, ...patch });
        const u: Record<string, unknown> = {};
        u.eq = () => u;
        u.then = (r: (v: unknown) => unknown) => r({ error: null });
        return u;
      };
      chain.insert = () => {
        const ins: Record<string, unknown> = {};
        ins.select = () => ins;
        ins.single = async () => ({ data: { id: "m" }, error: null });
        ins.maybeSingle = async () => ({ data: { id: "m" }, error: null });
        ins.then = (r: (v: unknown) => unknown) => r({ data: null, error: null });
        return ins;
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fakeSb() }));

import { updateCommunityMessengerPrivateGroupNotice } from "@/lib/community-messenger/service";

describe("메신저 방 공지 저장", () => {
  it("모임 방 → moim_room_settings_managed_by_moim, 방 갱신 없음 (이전: 저장됨)", async () => {
    updates.length = 0;
    roomRow = { id: "r1", room_type: "private_group", allow_admin_edit_notice: true, owner_domain: "moim" };
    const r = await updateCommunityMessengerPrivateGroupNotice({ userId: "u1", roomId: "r1", noticeText: "hello" });
    expect(r).toEqual({ ok: false, error: "moim_room_settings_managed_by_moim" });
    expect(updates.filter((u) => u.table === "community_messenger_rooms")).toHaveLength(0);
  });

  it("일반 그룹 방 → 지금처럼 저장 시도", async () => {
    updates.length = 0;
    roomRow = { id: "r2", room_type: "private_group", allow_admin_edit_notice: true, owner_domain: null };
    await updateCommunityMessengerPrivateGroupNotice({ userId: "u1", roomId: "r2", noticeText: "hello" });
    expect(updates.find((u) => u.table === "community_messenger_rooms")).toMatchObject({ notice_text: "hello" });
  });
});
