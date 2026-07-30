import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

describe("group chat Phase3 S1 invite/join contracts", () => {
  it("migrations define invite links + join requests SSOT", () => {
    const m1 = readFileSync(
      join(ROOT, "supabase/migrations/20261011120000_cm_group_invite_links.sql"),
      "utf8"
    );
    const m2 = readFileSync(
      join(ROOT, "supabase/migrations/20261011123000_cm_group_join_requests.sql"),
      "utf8"
    );
    expect(m1).toContain("community_messenger_group_invite_links");
    expect(m1).toContain("requires_approval");
    expect(m1).toContain("community_messenger_create_group_invite_link");
    expect(m1).toContain("community_messenger_revoke_group_invite_link");
    expect(m2).toContain("community_messenger_group_join_requests");
    expect(m2).toContain("community_messenger_join_group_via_invite_link");
    expect(m2).toContain("community_messenger_request_group_join");
    expect(m2).toContain("community_messenger_decide_group_join_request");
    expect(m2).toContain("community_messenger_close_pending_join_on_direct_add");
    expect(m2).toContain("status = 'pending'");
  });

  it("invite preview page does not auto-join on mount", () => {
    const page = readFileSync(join(ROOT, "app/(main)/group/[token]/page.tsx"), "utf8");
    expect(page).toContain("invite-preview");
    expect(page).toContain("async function joinNow");
    // Auto-join removed: mount effect only loads preview.
    const effectBlock = page.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[params, safeT\]\);/)?.[0] ?? "";
    expect(effectBlock).toContain("invite-preview");
    expect(effectBlock).not.toContain("/api/community-messenger/group-rooms/join\"");
    expect(page).toContain("그룹 참여");
    expect(page).toContain("가입 요청");
  });

  it("inviteGroupMembers closes pending join requests", () => {
    const svc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-service.ts"),
      "utf8"
    );
    expect(svc).toContain("closePendingJoinRequestsOnDirectAdd");
  });

  it("join via link uses atomic RPC", () => {
    const svc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-invite-link-service.ts"),
      "utf8"
    );
    expect(svc).toContain("community_messenger_join_group_via_invite_link");
    expect(svc).toContain("previewGroupInviteLink");
  });

  it("private group create panel supports two-step UX", () => {
    const panel = readFileSync(
      join(ROOT, "components/community-messenger/CommunityMessengerPrivateGroupCreatePanel.tsx"),
      "utf8"
    );
    expect(panel).toContain('subStep === "details"');
    expect(panel).toContain("PrivateGroupCreateSubStep");
  });
});
