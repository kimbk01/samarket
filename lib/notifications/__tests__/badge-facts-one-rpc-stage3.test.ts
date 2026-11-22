/**
 * 2026-11-22 읽음 3단계 — 배지 계산 입력 3번(안 읽은 방 입력·종 알림 행·소유 매장) → DB 함수 1번.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage3-badge-facts-design-2026-11-22.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMemberBadgeFacts,
  resetMemberBadgeFactsMissingForTests,
} from "@/lib/notifications/badge-authority-rebuild/load-member-badge-facts";

beforeEach(() => resetMemberBadgeFactsMissingForTests());

function sb(res: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => res);
  return { client: { rpc } as never, rpc };
}

describe("loadMemberBadgeFacts", () => {
  it("1번 불러 세 입력을 돌려준다", async () => {
    const { client, rpc } = sb({
      data: { inputs: [{ user_id: "u", room_id: "r" }], bell_rows: [{ id: "e1" }], owned_store_ids: ["s1", " "] },
      error: null,
    });
    const f = await loadMemberBadgeFacts(client, "u", 2000);
    expect(rpc).toHaveBeenCalledWith("get_member_badge_facts", { p_user_id: "u", p_bell_limit: 2000 });
    expect(f).toEqual({ inputs: [{ user_id: "u", room_id: "r" }], bellRows: [{ id: "e1" }], ownedStoreIds: ["s1"] });
  });
  it("오류·모양 다름 → null(지금 3번 경로)", async () => {
    expect(await loadMemberBadgeFacts(sb({ data: null, error: { message: "timeout" } }).client, "u", 2000)).toBeNull();
    expect(await loadMemberBadgeFacts(sb({ data: { inputs: [] }, error: null }).client, "u", 2000)).toBeNull();
  });
  it("함수 없음(DB 적용 전) → null 이고 5분 동안 다시 부르지 않는다", async () => {
    const a = sb({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await loadMemberBadgeFacts(a.client, "u", 2000)).toBeNull();
    const b = sb({ data: { inputs: [], bell_rows: [], owned_store_ids: [] }, error: null });
    expect(await loadMemberBadgeFacts(b.client, "u", 2000)).toBeNull();
    expect(b.rpc).not.toHaveBeenCalled();
  });
});

describe("계산기 연결", () => {
  const src = readFileSync(join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"), "utf8");
  it("세 입력을 함수 결과로 · 없으면 지금 로더", () => {
    expect(src).toContain("const badgeFactsP = loadMemberBadgeFacts(sb, uid, MEMBER_NOTIFICATION_A_LOAD_LIMIT);");
    expect(src).toContain("const inputRows = facts ? facts.inputs : await loadMemberUnreadRoomInputs(sb, uid);");
    expect(src).toMatch(/facts\s*\?\s*facts\.bellRows\s*:\s*await loadBellExplainUnreadEventRows\(sb, uid, \{ limit: MEMBER_NOTIFICATION_A_LOAD_LIMIT \}\)/);
    expect(src).toContain("loadOwnerOperationOFacts(sb, uid, facts ? facts.ownedStoreIds : null)");
  });
  it("매장 목록을 받으면 매장 조회를 하지 않는다", async () => {
    const { loadOwnerOperationOFacts } = await import("@/lib/notifications/badge-authority-rebuild/load-owner-operation-o-facts");
    const from = vi.fn();
    const r = await loadOwnerOperationOFacts({ from, rpc: vi.fn() } as never, "u", []);
    expect(from).not.toHaveBeenCalled();
    expect(r).toEqual({ ownerOperationCount: 0, ownerOperationBellCount: 0, storeIds: [] });
  });
});

describe("DB 함수 = 지금 조회와 같은 조건", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20271122110000_get_member_badge_facts.sql"), "utf8");
  it("조건·정렬·상한·권한", () => {
    expect(sql).toContain("from public.member_unread_room_inputs i");
    expect(sql).toContain("where e.user_id = p_user_id and e.unread = true and e.read_at is null");
    expect(sql).toContain("order by e.created_at desc");
    expect(sql).toContain("limit greatest(1, least(2000, coalesce(p_bell_limit, 2000)))");
    expect(sql).toContain("e.id, e.type, e.category, e.display_payload, e.room_id, e.dedupe_key");
    expect(sql).toContain("where st.owner_user_id = p_user_id limit 50");
    expect(sql).toContain("grant execute on function public.get_member_badge_facts(uuid, integer) to service_role;");
    expect(sql).not.toMatch(/to (anon|authenticated)\b/);
  });
});
