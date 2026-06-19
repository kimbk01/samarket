import { describe, expect, it } from "vitest";
import { canEditGroupRoomProfile } from "@/lib/community-messenger/group/group-room-profile-policy";
import { canPinGroupMessage } from "@/lib/community-messenger/group/group-room-pin-policy";
import {
  contentHasMentionSyntax,
  parseMentionTokens,
} from "@/lib/community-messenger/group/group-room-mention-parser";
import { shouldNotifyMentionRecipient } from "@/lib/community-messenger/group/group-room-mention-policy";
import { presentGroupReadReceipt } from "@/lib/community-messenger/group/group-room-read-presenter";
import {
  canAssignGroupAdmin,
  groupRoleBadgeLabel,
} from "@/lib/community-messenger/group/group-room-role-policy";
import {
  buildGroupInviteWebPath,
  generateGroupInviteToken,
  normalizeGroupInviteToken,
} from "@/lib/community-messenger/group/group-room-invite-token";
import {
  encodeGroupMediaCursor,
  filterGroupMediaRows,
  parseGroupMediaCursor,
} from "@/lib/community-messenger/group/group-room-media-index";
import { groupMessageHasReply } from "@/lib/community-messenger/group/group-room-message-presenter";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";

const baseRoom = {
  owner_user_id: "owner-1",
  allow_member_invite: true,
  allow_admin_invite: true,
  allow_admin_kick: true,
  allow_admin_edit_notice: true,
};

describe("group chat P1 contracts", () => {
  describe("profile policy", () => {
    it("owner can edit profile", () => {
      expect(
        canEditGroupRoomProfile({
          viewerUserId: "owner-1",
          viewerRole: "owner",
          room: baseRoom,
        })
      ).toBe(true);
    });
    it("member cannot edit profile", () => {
      expect(
        canEditGroupRoomProfile({
          viewerUserId: "m1",
          viewerRole: "member",
          room: baseRoom,
        })
      ).toBe(false);
    });
  });

  describe("pin policy", () => {
    it("admin can pin", () => {
      expect(
        canPinGroupMessage({
          viewerUserId: "a1",
          viewerRole: "admin",
          room: baseRoom,
        })
      ).toBe(true);
    });
  });

  describe("reply presenter", () => {
    it("detects reply message id", () => {
      expect(groupMessageHasReply({ replyToMessageId: "msg-1" })).toBe(true);
      expect(groupMessageHasReply({ replyToMessageId: null })).toBe(false);
    });
  });

  describe("mention parser", () => {
    it("parses @nickname tokens", () => {
      const tokens = parseMentionTokens("hello @alice and @bob_1");
      expect(tokens.map((t) => t.nickname)).toEqual(["alice", "bob_1"]);
      expect(contentHasMentionSyntax("@test hi")).toBe(true);
    });
    it("routes mention recipients", () => {
      expect(
        shouldNotifyMentionRecipient({
          mentionUserIds: ["u2"],
          recipientUserId: "u2",
          senderUserId: "u1",
        })
      ).toBe(true);
      expect(
        shouldNotifyMentionRecipient({
          mentionUserIds: ["u2"],
          recipientUserId: "u1",
          senderUserId: "u1",
        })
      ).toBe(false);
    });
  });

  describe("read presenter", () => {
    it("formats read count label", () => {
      expect(
        presentGroupReadReceipt({
          messageId: "m1",
          readCount: 3,
          readerLabels: ["A", "B"],
        }).label
      ).toContain("읽음");
    });
  });

  describe("admin roles", () => {
    it("owner can assign admin", () => {
      expect(
        canAssignGroupAdmin({
          viewerUserId: "owner-1",
          viewerRole: "owner",
          room: baseRoom,
        })
      ).toBe(true);
    });
    it("shows admin badge label", () => {
      expect(groupRoleBadgeLabel("admin")).toBe("관리자");
      expect(groupRoleBadgeLabel("owner")).toBe("방장");
    });
  });

  describe("invite link", () => {
    it("generates token and path", () => {
      const token = generateGroupInviteToken();
      expect(token.length).toBeGreaterThan(10);
      expect(buildGroupInviteWebPath(token)).toBe(`/group/${encodeURIComponent(token)}`);
      expect(normalizeGroupInviteToken("  abcdefgh  ")).toBe("abcdefgh");
    });
  });

  describe("media index", () => {
    it("filters image/file rows and cursor", () => {
      const rows = filterGroupMediaRows(
        [
          {
            id: "m1",
            message_type: "image",
            content: "https://x/y.jpg",
            created_at: "2026-06-19T00:00:00.000Z",
            sender_id: "u1",
            metadata: {},
          },
          { id: "m2", message_type: "text", content: "hi", created_at: "2026-06-19T00:00:01.000Z" },
        ],
        "all"
      );
      expect(rows).toHaveLength(1);
      const cursor = encodeGroupMediaCursor("2026-06-19T00:00:00.000Z", "m1");
      expect(parseGroupMediaCursor(cursor)?.messageId).toBe("m1");
    });
  });

  describe("notification SSOT", () => {
    it("maps mention/pin to group category", () => {
      expect(categoryForEventType("mention_message")).toBe("group");
      expect(categoryForEventType("pin_message")).toBe("group");
    });
  });
});
