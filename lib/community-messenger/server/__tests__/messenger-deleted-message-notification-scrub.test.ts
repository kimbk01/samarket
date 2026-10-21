import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  scrubDeletedMessageNotificationBody,
  scrubDeletedMessageNotificationRow,
  scrubNotificationEventsForDeletedMessage,
} from "@/lib/community-messenger/server/messenger-deleted-message-notification-scrub";

const PH = "삭제된 메시지입니다";

function fakeSb(rows: Array<{ id: string; body: string; display_payload: unknown; message_id: string; room_id: string }>) {
  const updates: Array<{ patch: Record<string, unknown>; ids: string[] }> = [];
  const filters: Array<[string, string]> = [];
  const sb = {
    from(table: string) {
      expect(table).toBe("notification_events");
      return {
        select() {
          const q = {
            eq(col: string, v: string) {
              filters.push([col, v]);
              return q;
            },
            async limit() {
              const data = rows.filter((r) =>
                filters.every(([c, v]) => (r as unknown as Record<string, string>)[c] === v)
              );
              return { data, error: null };
            },
          };
          return q;
        },
        update(patch: Record<string, unknown>) {
          return {
            async in(_col: string, ids: string[]) {
              updates.push({ patch, ids });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, updates, filters };
}

describe("D-2 deleted message notification scrub", () => {
  it("keeps the sender prefix for group/trade bodies; replaces preview otherwise", () => {
    expect(scrubDeletedMessageNotificationBody({ body: "Kim: secret", senderName: "Kim", placeholder: PH })).toBe(
      `Kim: ${PH}`
    );
    expect(scrubDeletedMessageNotificationBody({ body: "secret", senderName: "Kim", placeholder: PH })).toBe(PH);
    const r = scrubDeletedMessageNotificationRow(
      { body: "Kim: secret", display_payload: { senderName: "Kim", previewText: "secret", body: "Kim: secret", title: "Room" } },
      PH
    );
    expect(r.body).toBe(`Kim: ${PH}`);
    expect(r.display_payload).toMatchObject({ previewText: PH, body: `Kim: ${PH}`, title: "Room", previewKind: "deleted" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("updates every notification_events row for the message id (grouped), never other messages", async () => {
    const { sb, updates, filters } = fakeSb([
      { id: "e1", body: "secret", display_payload: { senderName: "A", previewText: "secret", body: "secret" }, message_id: "m1", room_id: "r1" },
      { id: "e2", body: "secret", display_payload: { senderName: "A", previewText: "secret", body: "secret" }, message_id: "m1", room_id: "r1" },
      { id: "e3", body: "A: secret", display_payload: {}, message_id: "m1", room_id: "r1" },
      { id: "e4", body: "other", display_payload: {}, message_id: "m2", room_id: "r1" },
    ]);
    const out = await scrubNotificationEventsForDeletedMessage(sb, { roomId: "r1", messageId: "m1", placeholder: PH });
    expect(out.updated).toBe(3);
    expect(filters).toEqual([
      ["message_id", "m1"],
      ["room_id", "r1"],
    ]);
    const ids = updates.flatMap((u) => u.ids).sort();
    expect(ids).toEqual(["e1", "e2", "e3"]);
    expect(updates.length).toBe(2);
    expect(JSON.stringify(updates)).not.toContain("secret");
  });

  it("delete-for-everyone calls the scrub best-effort after the delete succeeds", () => {
    const root = path.resolve(__dirname, "../../../..");
    const src = readFileSync(path.join(root, "lib/community-messenger/service.ts"), "utf8");
    const start = src.indexOf("export async function softDeleteCommunityMessengerMessageForEveryone(");
    const end = src.indexOf("\nexport async function ", start + 10);
    const fn = src.slice(start, end);
    const del = fn.indexOf("deleted_for_everyone_at: nowIso()");
    const scrub = fn.indexOf("scrubNotificationEventsForDeletedMessage(sb as any");
    expect(del).toBeGreaterThan(0);
    expect(scrub).toBeGreaterThan(del);
    const block = fn.slice(fn.lastIndexOf("try {", scrub), fn.indexOf("notification_scrub_failed", scrub));
    expect(block).toContain("placeholder: resolveDeletedMessagePlaceholder()");
    expect(fn.slice(scrub, scrub + 600)).toContain("} catch (err) {");
  });
});
