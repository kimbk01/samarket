/**
 * 삭제된 그룹 목록 제외 — 서버 목록 원천 함수 계약 (docs/audit/cm-deleted-group-list-leak-design-2026-11-14.md D1).
 * 클라이언트 tombstone 만으로는 앱이 꺼져 있던 멤버·재설치·새 기기에서 삭제 그룹이 다시 나온다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20271115010000_cm_room_list_exclude_deleted_groups.sql"),
  "utf8"
);

describe("삭제 그룹 서버 목록 제외 (D1)", () => {
  it("lite bundle 목록 조건에 deleted_at is null 을 추가한다", () => {
    expect(MIGRATION).toContain("p.proname = 'community_messenger_bootstrap_lite_my_rooms_bundle'");
    expect(MIGRATION).toContain(
      "v_new_a text := E'      and p.blocked_hidden_at is null\\n      and r.deleted_at is null\\n';"
    );
  });

  it("my_room_ids 목록 조건에 deleted_at is null 을 추가한다", () => {
    expect(MIGRATION).toContain("p.proname = 'community_messenger_bootstrap_my_room_ids'");
    expect(MIGRATION).toContain(
      "v_new_b text := E'    WHERE p.user_id = p_user_id\\n      AND r.deleted_at IS NULL\\n';"
    );
  });

  it("문장이 정확히 1회일 때만 교체하고 아니면 중단한다", () => {
    expect(MIGRATION).toContain("raise exception 'lite bundle 문장 A 불일치'");
    expect(MIGRATION).toContain("raise exception 'my_room_ids 문장 B 불일치'");
  });

  it("참여자·메시지 행을 바꾸지 않는다 (S2-4 보존 계약)", () => {
    expect(MIGRATION).not.toMatch(/\b(update|delete from|insert into)\s+public\.community_messenger_/i);
  });
});
