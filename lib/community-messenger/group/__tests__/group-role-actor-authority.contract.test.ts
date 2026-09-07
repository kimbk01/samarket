import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("group role actor authority contract", () => {
  it("setCommunityMessengerGroupMemberRole uses actor-scoped write (not auth.uid()-only RPC)", () => {
    const service = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    const start = service.indexOf("export async function setCommunityMessengerGroupMemberRole");
    expect(start).toBeGreaterThan(-1);
    const slice = service.slice(start, start + 3500);
    expect(slice).toContain("actorUserId");
    expect(slice).toContain('update({ role: nextRole })');
    expect(slice).toContain("Actor-scoped write");
    // Must not call the legacy 3-arg RPC that ignores actor under service_role.
    expect(slice).not.toContain('rpc("community_messenger_set_group_member_role"');
  });
});
