import { describe, expect, it } from "vitest";
import {
  classifyMemberNotificationDomain,
  resolveMemberNotificationRowLabelKey,
} from "@/lib/notifications/member-notification-domain";
import { buildMemberAdminNoteNotificationPayload } from "@/lib/notifications/member-admin-notes";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";

describe("inquiry / message semantic isolation", () => {
  it("payload no longer stamps campaignType=system", () => {
    const inquiry = buildMemberAdminNoteNotificationPayload({
      threadId: "t1",
      subject: "s",
      bodyPreview: "b",
      startedBy: "member",
    });
    expect(inquiry.campaignType).toBeUndefined();
    expect(inquiry.supportKind).toBe("inquiry");
    expect(inquiry.routeUrl).toBe("/mypage/inquiries/t1");

    const inbox = buildMemberAdminNoteNotificationPayload({
      threadId: "t2",
      subject: "s",
      bodyPreview: "b",
      startedBy: "admin",
    });
    expect(inbox.campaignType).toBeUndefined();
    expect(inbox.supportKind).toBe("direct_message");
    expect(inbox.routeUrl).toBe("/mypage/inbox/t2");
  });

  it("inquiry/message are not notice or system tab domains", () => {
    const inquiryRow = {
      event_type: "inquiry_answered",
      bell_presentation_type: "admin_notice",
      campaign_type: "system", // legacy poison
      push_kind: "cs",
    };
    expect(classifyMemberNotificationDomain(inquiryRow)).toBeNull();
    expect(matchesNotificationCenterMemberTab(inquiryRow, "system")).toBe(false);
    expect(matchesNotificationCenterMemberTab(inquiryRow, "notice")).toBe(false);
    expect(resolveMemberNotificationRowLabelKey(inquiryRow)).toBe("notif_label_inquiry_reply");

    const messageRow = {
      event_type: "inbox_message_received",
      campaign_type: "system",
    };
    expect(classifyMemberNotificationDomain(messageRow)).toBeNull();
    expect(resolveMemberNotificationRowLabelKey(messageRow)).toBe("notif_label_direct_message");
  });
});
