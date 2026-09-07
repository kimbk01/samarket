import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("group message notify roomKind resolve", () => {
  it("post-ack effects load room_type when send RPC omits it", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/server/community-messenger-send-post-ack-effects.ts"),
      "utf8"
    );
    expect(src).toContain('select("room_type, direct_key")');
    expect(src).toContain("resolveGroupMessageRoomKind(roomType, directKey)");
    expect(src).toContain("Without a fallback lookup");
  });

  it("legacy send fallback includes roomType on postAckEffects", () => {
    const service = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("select(\"id, room_status, is_readonly, direct_key, deleted_at, room_type\")");
    expect(service).toContain("roomType: roomTypeStr");
  });
});
