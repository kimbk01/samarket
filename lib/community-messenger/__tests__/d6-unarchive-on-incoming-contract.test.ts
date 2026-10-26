import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(p, "utf8");

describe("D-6 보관한 방 새 활동 시 목록 복귀", () => {
  const mig = src("supabase/migrations/20270629120000_cm_unarchive_on_incoming_activity.sql");

  it("운영 정의에 한 줄만 넣고, 위치가 정확히 1번이 아니면 중단", () => {
    expect(mig).toContain("pg_get_functiondef('public.community_messenger_send_text_message(");
    expect(mig).toContain("pg_get_functiondef('public.dibay_append_room_message_atomic(");
    expect(mig.match(/RAISE EXCEPTION 'D-6 anchor not found exactly once/g)?.length).toBe(2);
  });

  it("규칙: 받는 사람·알림 켜짐·차단/거절 숨김 아님·그룹 차단 아님만 보관 해제", () => {
    for (const cond of [
      "p.user_id <> p_sender_id",
      "NOT coalesce(p.is_muted, false)",
      "p.blocked_hidden_at IS NULL",
      "p.declined_hidden_at IS NULL",
      "cm_group_is_user_banned(p_room_id, p.user_id)",
      "ELSE p.is_archived",
    ]) {
      expect(mig).toContain(cond);
    }
  });

  it("통화 기록은 부재중(안 읽은 수 분기)만 — 기존 행 갱신 경로도 같은 규칙", () => {
    const service = src("lib/community-messenger/service.ts");
    const i = service.indexOf("const updateExistingStub = async");
    const body = service.slice(i, i + 2500);
    expect(body).toContain("if (shouldIncrementUnread) {");
    expect(body).toContain('.update({ is_archived: false })');
    expect(body).toContain('.neq("user_id", actorId)');
    expect(body).toContain('.is("blocked_hidden_at", null)');
    expect(body).toContain('.is("declined_hidden_at", null)');
    expect(body).toContain('.or("is_muted.is.null,is_muted.eq.false")');
  });
});
