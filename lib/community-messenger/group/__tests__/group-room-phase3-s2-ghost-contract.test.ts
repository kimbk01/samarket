import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

describe("group chat Phase3 S2-2 Ghost contracts", () => {
  it("ghost service audits enter/exit and never upserts participants", () => {
    const svc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-ghost-service.ts"),
      "utf8"
    );
    expect(svc).toContain("community_messenger.ghost_enter");
    expect(svc).toContain("community_messenger.ghost_exit");
    expect(svc).toContain("appendAuditLog");
    expect(svc).toContain("invisible_read_only");
    expect(svc).not.toContain("upsertGroupMemberParticipants");
    expect(svc).not.toContain("cm_group_activate_member");
    expect(svc).not.toContain(".insert({");
    expect(svc).not.toMatch(/from\("community_messenger_participants"\)[\s\S]{0,80}\.insert/);
    expect(svc).not.toMatch(/from\("community_messenger_presence_snapshots"\)/);
  });

  it("ghost API is admin-gated and probes participant unchanged", () => {
    const route = readFileSync(
      join(ROOT, "app/api/admin/community-messenger/rooms/[id]/ghost/route.ts"),
      "utf8"
    );
    expect(route).toContain("requireAdminApiUser");
    expect(route).toContain("enterGhostRoom");
    expect(route).toContain("exitGhostRoom");
    expect(route).toContain("countRoomParticipantsForGhostProbe");
    expect(route).toContain("participantProbe");
    expect(route).not.toContain("messengerRoomCanonicalOrJsonError");
  });

  it("Admin Console detail uses ghost enter/exit without user-facing menu", () => {
    const page = readFileSync(
      join(ROOT, "components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx"),
      "utf8"
    );
    expect(page).toContain('/ghost');
    expect(page).toContain('action: "enter"');
    expect(page).toContain('action: "exit"');
    expect(page).toContain("admin_cm_ghost_banner_title");
    expect(page).toContain("admin_cm_ghost_audits_title");
  });

  it("does not expose Ghost in user CM Phase2 member modal", () => {
    const modal = readFileSync(
      join(
        ROOT,
        "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx"
      ),
      "utf8"
    );
    expect(modal).not.toContain("ghost");
    expect(modal).not.toContain("Ghost");
  });

  it("Ban LOCK surfaces remain intact", () => {
    const ban = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-ban-service.ts"),
      "utf8"
    );
    expect(ban).toContain("community_messenger_ban_group_member");
    expect(ban).toContain("community_messenger_unban_group_member");
  });
});
