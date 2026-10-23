import { describe, expect, it } from "vitest";
import {
  filterGroupMediaRows,
  isGroupMediaRowVisibleToMembers,
} from "@/lib/community-messenger/group/group-room-media-index";

function row(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "m1",
    message_type: "image",
    content: "https://example.com/a.jpg",
    created_at: "2026-10-24T00:00:00Z",
    sender_id: "u1",
    metadata: {},
    deleted_at: null,
    deleted_for_everyone_at: null,
    is_hidden_by_admin: null,
    ...partial,
  };
}

describe("group-room-media-index (A-1)", () => {
  it("keeps normal image/file including null/false hidden", () => {
    expect(isGroupMediaRowVisibleToMembers(row({}))).toBe(true);
    expect(isGroupMediaRowVisibleToMembers(row({ is_hidden_by_admin: false }))).toBe(true);
    expect(isGroupMediaRowVisibleToMembers(row({ is_hidden_by_admin: null }))).toBe(true);
  });

  it("excludes soft-deleted, delete-for-everyone, and admin-hidden", () => {
    expect(isGroupMediaRowVisibleToMembers(row({ deleted_at: "2026-10-24T01:00:00Z" }))).toBe(false);
    expect(
      isGroupMediaRowVisibleToMembers(row({ deleted_for_everyone_at: "2026-10-24T01:00:00Z" }))
    ).toBe(false);
    expect(isGroupMediaRowVisibleToMembers(row({ is_hidden_by_admin: true }))).toBe(false);
  });

  it("filterGroupMediaRows drops hidden/deleted and keeps pagination-ready order input", () => {
    const items = filterGroupMediaRows(
      [
        row({ id: "ok-img", message_type: "image" }),
        row({ id: "dfe", deleted_for_everyone_at: "2026-10-24T01:00:00Z" }),
        row({ id: "hid", is_hidden_by_admin: true }),
        row({ id: "ok-file", message_type: "file", content: "https://example.com/a.pdf" }),
        row({ id: "soft", deleted_at: "2026-10-24T01:00:00Z" }),
      ],
      "all"
    );
    expect(items.map((i) => i.messageId)).toEqual(["ok-img", "ok-file"]);
  });

  it("type filter still applies after visibility", () => {
    const images = filterGroupMediaRows(
      [row({ id: "img", message_type: "image" }), row({ id: "file", message_type: "file" })],
      "image"
    );
    expect(images.map((i) => i.messageId)).toEqual(["img"]);
  });
});
