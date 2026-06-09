import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("appendCommunityMessengerSystemMessage unread policy", () => {
  it("does not bump participant unread for system messages", () => {
    const servicePath = join(process.cwd(), "lib/community-messenger/service.ts");
    const src = readFileSync(servicePath, "utf8");
    const start = src.indexOf("async function appendCommunityMessengerSystemMessage");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nconst COMMUNITY_MESSENGER_IMAGE_ALBUM_MAX", start);
    const body = src.slice(start, end > start ? end : start + 1200);
    expect(body).not.toContain("community_messenger_apply_unread_for_text_message");
    expect(body).not.toContain("unreadCount + 1");
  });
});
