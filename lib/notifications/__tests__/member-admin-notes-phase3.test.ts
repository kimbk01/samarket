import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMemberAdminNoteNotificationPayload,
  buildMemberAdminNoteRoute,
  kindFromStartedBy,
} from "@/lib/notifications/member-admin-notes";
import {
  resolveBellPresentationType,
  resolveEventInboxLinkUrl,
} from "@/lib/notifications/inbox-events-merge";
import { eventTypeForAdminCampaignType } from "@/lib/notifications/core/notification-event-registry";

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
    expect(p.previewKind).toBe("member_admin_note");
  });

  it("Bell prefers noteThreadId over poisoned routeUrl (legacy admin_notice dual-read)", () => {
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
        previewKind: "member_admin_note",
        noteThreadId: "n1",
        startedBy: "admin",
        routeUrl: "/https://samarket.vercel.app/notifications/notes/n1",
      },
    } as never);
    expect(href).toBe("/mypage/inbox/n1");
  });

  it("Bell falls back to inquiries when startedBy missing (legacy)", () => {
    const href = resolveEventInboxLinkUrl({
      id: "e2",
      user_id: "u1",
      type: "admin_notice",
      category: "admin_notice",
      title: "t",
      body: "b",
      unread: true,
      created_at: new Date().toISOString(),
      display_payload: { noteThreadId: "n2", previewKind: "member_admin_note" },
    } as never);
    expect(href).toBe("/mypage/inquiries/n2");
  });
});

describe("Phase 5 Slice 1 taxonomy A — Inquiry/Inbox typed events", () => {
  it("notes writer source no longer writes type admin_notice", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/member-admin-notes-service.ts"),
      "utf8"
    );
    expect(src).toMatch(/inquiry_answered/);
    expect(src).toMatch(/inbox_message_received/);
    expect(src).not.toMatch(/type:\s*"admin_notice"/);
    expect(src).not.toMatch(/category:\s*"admin_notice"/);
  });

  it("Campaign eventType mapping uses notice_published for notice/system (Phase 5 Slice 2)", () => {
    expect(eventTypeForAdminCampaignType("notice")).toBe("notice_published");
    expect(eventTypeForAdminCampaignType("system")).toBe("notice_published");
    expect(eventTypeForAdminCampaignType("marketing")).toBe("admin_marketing_banner");
  });

  it("notice_published Bell presentation follows campaignType", () => {
    expect(
      resolveBellPresentationType({
        id: "e6",
        type: "notice_published",
        category: "notice_published",
        title: "N",
        body: "b",
        display_payload: { campaignType: "notice", previewKind: "admin_campaign" },
      } as never)
    ).toBe("admin_notice");
    expect(
      resolveBellPresentationType({
        id: "e7",
        type: "notice_published",
        category: "notice_published",
        title: "S",
        body: "b",
        display_payload: { campaignType: "system", previewKind: "admin_campaign" },
      } as never)
    ).toBe("admin_system");
  });

  it("inquiry_answered deep link + Bell presentation", () => {
    const event = {
      id: "e3",
      type: "inquiry_answered",
      category: "inquiry_answered",
      title: "t",
      body: "b",
      display_payload: {
        previewKind: "member_admin_note",
        noteThreadId: "inq-1",
        startedBy: "member",
        routeUrl: "/mypage/inquiries/inq-1",
      },
    };
    expect(resolveEventInboxLinkUrl(event as never)).toBe("/mypage/inquiries/inq-1");
    expect(resolveBellPresentationType(event as never)).toBe("admin_notice");
  });

  it("inbox_message_received deep link + Bell presentation", () => {
    const event = {
      id: "e4",
      type: "inbox_message_received",
      category: "inbox_message_received",
      title: "t",
      body: "b",
      display_payload: {
        previewKind: "member_admin_note",
        noteThreadId: "inb-1",
        startedBy: "admin",
        routeUrl: "/mypage/inbox/inb-1",
      },
    };
    expect(resolveEventInboxLinkUrl(event as never)).toBe("/mypage/inbox/inb-1");
    expect(resolveBellPresentationType(event as never)).toBe("admin_notice");
  });

  it("legacy admin_notice + member_admin_note still presents as admin_notice", () => {
    expect(
      resolveBellPresentationType({
        id: "e5",
        type: "admin_notice",
        category: "admin_notice",
        title: "t",
        body: "b",
        display_payload: {
          previewKind: "member_admin_note",
          noteThreadId: "legacy-1",
          startedBy: "member",
        },
      } as never)
    ).toBe("admin_notice");
  });
});
