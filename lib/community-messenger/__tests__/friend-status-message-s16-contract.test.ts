import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 1단계 문서 §16 (Owner 2026-10-25 승인): 소개 → 「상태」, 친구 목록·상대 프로필에 상태 표시 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("§16 friend status message", () => {
  it("친구 목록 2행: 상태가 있으면 상태, 없으면 접속 상태", () => {
    const row = read("components/community-messenger/friend-list/CommunityMessengerFriendRow.tsx");
    expect(row).toContain("{row.subtitle ? (");
    expect(row).toContain("data-cm-friend-status-message");
    expect(row).toContain("<CommunityMessengerFriendPresenceLine peerUserId={row.profileId} />");
    const presenter = read("lib/community-messenger/friend-list/friend-relation-presenter.ts");
    expect(presenter).toContain("subtitle: input.profile.bio?.trim() || null,");
  });

  it("상대 프로필 시트: @아이디·상태 상자·접속 상태, 비어 있으면 users/resolve 1회", () => {
    const sheet = read("components/community-messenger/MessengerFriendProfileSheet.tsx");
    expect(sheet).toContain("/api/community-messenger/users/resolve?targetUserId=");
    expect(sheet).toContain("data-cm-friend-profile-status");
    expect(sheet).toContain('t("cm_profile_status_label")');
    expect(sheet).toContain("data-cm-friend-profile-presence");
    const route = read("app/api/community-messenger/users/resolve/route.ts");
    expect(route).toContain("bio: p.bio?.trim() || null,");
  });

  it("프로필 「소개」 문구 → 「상태」", () => {
    const mypage = read("lib/i18n/catalog/mypage-components.ts");
    expect(mypage).toContain('mypage_profile_bio_empty: "상태 메시지가 없습니다"');
    expect(mypage).toContain('mypage_settings_profile_edit_desc: "닉네임, 상태, 프로필 사진"');
    expect(read("lib/i18n/catalog/mypage-hub.ts")).toContain('mypage_hub_profile_bio_empty: "상태를 추가해 보세요"');
    expect(read("lib/i18n/catalog/navigation.ts")).toContain('tier1_profile_edit_subtitle: "닉네임·사진·상태"');
    expect(read("lib/i18n/catalog/settings-ui.ts")).toContain('profile_edit_status_label: "나의 상태"');
  });
});
