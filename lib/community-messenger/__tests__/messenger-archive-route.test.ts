import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMessengerArchiveExitHref,
  buildMessengerArchiveHref,
  messengerArchiveGroupOrder,
  parseMessengerArchiveEntry,
  parseMessengerArchiveSection,
  resolveMessengerArchiveTier1,
} from "@/lib/community-messenger/messenger-archive-route";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { translate } from "@/lib/i18n/messages";

/** 채팅 시안 4판 「4. 보관함」 — 들어온 탭에 따라 묶음 순서·뒤로, 항목 상세는 주소로 */
describe("보관함 주소", () => {
  it("친구 탭(관리)에서 오면 「친구」 묶음 먼저, 대화 탭에서 오면 「채팅」 먼저", () => {
    expect(messengerArchiveGroupOrder(parseMessengerArchiveEntry("friends"))).toEqual(["friends", "chats"]);
    expect(messengerArchiveGroupOrder(parseMessengerArchiveEntry(null))).toEqual(["chats", "friends"]);
    expect(messengerArchiveGroupOrder(parseMessengerArchiveEntry("chats"))).toEqual(["chats", "friends"]);
    expect(messengerArchiveGroupOrder(parseMessengerArchiveEntry("junk"))).toEqual(["chats", "friends"]);
  });

  it("주소 만들기 — 들어온 탭·항목·진입 출처 유지", () => {
    expect(buildMessengerArchiveHref({ entry: "chats" })).toBe("/community-messenger?section=archive");
    expect(buildMessengerArchiveHref({ entry: "friends", section: "hidden_friends", from: "community" })).toBe(
      "/community-messenger?section=archive&archiveFrom=friends&archive=hidden_friends&from=community"
    );
    expect(buildMessengerArchiveExitHref("friends")).toBe("/community-messenger?section=friends");
    expect(buildMessengerArchiveExitHref("chats", "delivery")).toBe("/community-messenger?section=chats&from=delivery");
  });

  it("항목 값은 정해진 다섯 가지만", () => {
    expect(parseMessengerArchiveSection("requests")).toBe("requests");
    expect(parseMessengerArchiveSection("muted_chats")).toBe("muted_chats");
    expect(parseMessengerArchiveSection("nope")).toBeNull();
    expect(parseMessengerArchiveSection(null)).toBeNull();
  });

  it("머리글 제목·뒤로 — 첫 화면은 들어온 탭으로, 항목 상세는 보관함으로", () => {
    expect(resolveMessengerArchiveTier1("?section=chats")).toBeNull();
    expect(resolveMessengerArchiveTier1("?section=archive")).toEqual({
      titleText: "nav_messenger_archive",
      backHref: "/community-messenger?section=chats",
    });
    expect(resolveMessengerArchiveTier1("?section=archive&archiveFrom=friends")?.backHref).toBe(
      "/community-messenger?section=friends"
    );
    expect(resolveMessengerArchiveTier1("?section=archive&archiveFrom=friends&archive=blocked_friends")).toEqual({
      titleText: "cm_archive_row_blocked_friends",
      backHref: "/community-messenger?section=archive&archiveFrom=friends",
    });
    const tier1 = resolveMainTier1Subpage("/community-messenger", "?section=archive&archive=archived_chats");
    expect(tier1?.titleText).toBe("cm_archive_row_archived_chats");
    expect(tier1?.preferHistoryBack).toBe(true);
    expect(tier1?.backHref).toBe("/community-messenger?section=archive");
    /** 보관함이 아닌 메신저 홈은 그대로 허브 */
    expect(resolveMainTier1Subpage("/community-messenger", "?section=chats")?.titleText).toBe("tier1_messenger");
  });

  it("줄 이름 (시안 글자)", () => {
    expect(translate("ko", "cm_archive_row_archived_chats")).toBe("보관한 채팅");
    expect(translate("ko", "cm_archive_row_muted_chats")).toBe("알림 끈 대화");
    expect(translate("ko", "cm_archive_row_hidden_friends")).toBe("숨긴 친구");
    expect(translate("ko", "cm_archive_row_blocked_friends")).toBe("차단한 친구");
    expect(translate("ko", "cm_friend_rejected_section")).toBe("거절한 요청");
  });

  it("예전 「친구 관리」 시트·안내 문장 없음, 진입은 모두 보관함으로", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).not.toContain("friends-privacy");
    expect(home).not.toContain("MessengerFriendsPrivacySheet");
    /** 채팅 설정 「친구」 상세의 「친구 관리」 (채팅 시안 4판 「7」 — 설정은 하위 화면) */
    expect(home).toContain("onOpenFriendManage: openArchiveFromFriendsStable,");
    expect(home).toContain("onOpenFriendsManage={openArchiveFromFriendsStable}");
    expect(home).toContain('openMessengerArchive("friends")');
    expect(read("components/community-messenger/community-messenger-home-lazy-sheets.tsx")).not.toContain(
      "MessengerFriendsPrivacySheet"
    );
    const archive = read("components/community-messenger/MessengerArchiveScreen.tsx");
    expect(archive).not.toContain("cm_ui_manage_hidden_blocked_muted_archived");
    expect(archive).toContain("messengerArchiveGroupOrder(entry)");
  });
});
