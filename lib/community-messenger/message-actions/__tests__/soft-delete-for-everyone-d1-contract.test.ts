import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("softDeleteCommunityMessengerMessageForEveryone D-1 contract", () => {
  it("keeps content/metadata clear + relies on DB trigger (no TS scrub)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain("cm_scrub_reply_previews_on_delete_for_everyone");
    expect(src).not.toContain("scrubReplyPreviewsForDeletedMessage");
    expect(src).not.toContain("reply_preview_scrub_failed");
    expect(src).toMatch(/deleted_for_everyone_at:\s*nowIso\(\)/);
    expect(src).toMatch(/content:\s*""/);
    expect(src).toMatch(/metadata:\s*\{\}/);
  });

  it("migration defines AFTER UPDATE OF deleted_for_everyone_at scrub trigger", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20270624120000_cm_d1_scrub_reply_on_delete_for_everyone.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("cm_scrub_reply_previews_on_delete_for_everyone");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("AFTER UPDATE OF deleted_for_everyone_at");
    expect(sql).toContain("OLD.deleted_for_everyone_at IS NULL");
    expect(sql).toContain("NEW.deleted_for_everyone_at IS NOT NULL");
    expect(sql).toContain("reply_to_message_id = NEW.id");
    expect(sql).toContain("m.room_id = NEW.room_id");
    expect(sql).toContain("삭제된 메시지입니다");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM anon");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM authenticated"
    );
  });
});
