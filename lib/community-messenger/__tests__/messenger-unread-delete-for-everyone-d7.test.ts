/**
 * PR-C D7 (Owner 2026-11-16 「PR-C 진행」) — 「모두에게서 삭제」한 메시지는 안 읽음에서 빠진다.
 * 운영 DB 적용·시험 실행 결과는 docs/design/messenger-remaining-risks-design-2026-11-16.md §5.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20271116120000_cm_unread_exclude_deleted_for_everyone.sql"),
  "utf8"
);

describe("D7 안 읽음에서 지운 메시지 빼기", () => {
  it("재계산 함수가 deleted_for_everyone_at 을 뺀다(적용 전 해시 확인 후 교체)", () => {
    expect(sql).toContain("AND m.deleted_for_everyone_at IS NULL");
    expect(sql).toContain("'1aef6a6c77b367be70d1e17a2b24f459'");
  });

  it("삭제 전환(NULL→값) 때만 받는 사람 안 읽음 1 감소, 0 아래 금지", () => {
    expect(sql).toMatch(/AFTER UPDATE OF deleted_for_everyone_at ON public\.community_messenger_messages/);
    expect(sql).toMatch(/WHEN \(OLD\.deleted_for_everyone_at IS NULL AND NEW\.deleted_for_everyone_at IS NOT NULL\)/);
    expect(sql).toContain("greatest(0, coalesce(p.unread_count, 0) - 1)");
    expect(sql).toContain("p.user_id IS DISTINCT FROM NEW.sender_id");
  });

  it("이미 읽은 메시지(읽음 위치 이전)는 줄이지 않는다", () => {
    expect(sql).toMatch(/c\.id = p\.last_read_message_id[\s\S]*c\.created_at > NEW\.created_at OR \(c\.created_at = NEW\.created_at AND c\.id >= NEW\.id\)/);
  });
});
