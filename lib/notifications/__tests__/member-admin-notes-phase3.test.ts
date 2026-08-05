import { describe, expect, it } from "vitest";
import {
  buildMemberAdminNoteNotificationPayload,
  buildMemberAdminNoteRoute,
  kindFromStartedBy,
} from "@/lib/notifications/member-admin-notes";
import { resolveEventInboxLinkUrl } from "@/lib/notifications/inbox-events-merge";

describe("Phase 3 member-admin-notes paths", () => {
  it("routes Inquiry vs Inbox by started_by", () => {
    expect(kindFromStartedBy("member")).toBe("inquiry");
    expect(kindFromStartedBy("admin")).toBe("inbox");
    expect(buildMemberAdminNoteRoute("tid-1", "member")).toBe("/mypage/inquiries/tid-1");
    expect(buildMemberAdminNoteRoute("tid-2", "admin")).toBe("/mypage/inbox/tid-2");
  });

  it("payload keeps noteThreadId + startedBy + CS routeUrl", () => {
    const p = buildMemberAdminNoteNotificationPayload({
      threadId: "abc",
      subject: "Hello",
      bodyPreview: "Body",
      startedBy: "admin",
    });
    expect(p.noteThreadId).toBe("abc");
    expect(p.startedBy).toBe("admin");
    expect(p.routeUrl).toBe("/mypage/inbox/abc");
  });

  it("Bell prefers noteThreadId over poisoned routeUrl", () => {
    const href = resolveEventInboxLinkUrl({
      id: "e1",
      user_id: "u1",
      type: "admin_notice",
      category: "admin_notice",
      title: "t",
      body: "b",
      unread: true,
      created_at: new Date().toISOString(),
      display_payload: {
        noteThreadId: "n1",
        startedBy: "admin",
        routeUrl: "/https://samarket.vercel.app/notifications/notes/n1",
      },
    } as never);
    expect(href).toBe("/mypage/inbox/n1");
  });

  it("Bell falls back to inquiries when startedBy missing", () => {
    const href = resolveEventInboxLinkUrl({
      id: "e2",
      user_id: "u1",
      type: "admin_notice",
      category: "admin_notice",
      title: "t",
      body: "b",
      unread: true,
      created_at: new Date().toISOString(),
      display_payload: { noteThreadId: "n2" },
    } as never);
    expect(href).toBe("/mypage/inquiries/n2");
  });
});
