import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("listGroupRoomMedia A-1 query contract", () => {
  it("filters deleted_for_everyone_at and admin-hidden at query layer", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/group/group-room-media-service.ts"),
      "utf8"
    );
    expect(src).toContain('.is("deleted_at", null)');
    expect(src).toContain('.is("deleted_for_everyone_at", null)');
    expect(src).toContain('.or("is_hidden_by_admin.is.null,is_hidden_by_admin.eq.false")');
    expect(src).toContain("is_hidden_by_admin");
  });
});
