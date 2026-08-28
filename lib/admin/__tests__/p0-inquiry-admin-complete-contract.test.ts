import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseAdminMemberCareInquiryThreadId,
  parseAdminPlatformInquiryFocusRequestId,
  resolveAdminMemberCareInquiryHref,
  resolveAdminPlatformInquiryHref,
  resolveMemberCareInquiryHref,
  resolveOwnerPlatformInquiryHref,
} from "@/lib/admin/admin-inquiry-deeplink";
import { isAdminSoundEligible } from "@/lib/notifications/admin-notification-sound-policy";
import { ADMIN_ACTION_QUEUE_META } from "@/lib/admin/admin-action-queue";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("P0-C inquiry domain inventory (source)", () => {
  it("Care uses member_admin_note_threads; platform uses platform_admin_inquiries", () => {
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toContain('from("member_admin_note_threads")');
    expect(queue).toContain('.eq("started_by", "member")');
    expect(queue).toContain('.eq("status", "open")');
    expect(queue).toContain('from("platform_admin_inquiries")');
  });
});

describe("P0-C ADMIN_Q inquiry semantic (T1–T3)", () => {
  it("actionable = open / unanswered; meta RT+sound for Care + platform", () => {
    expect(ADMIN_ACTION_QUEUE_META.member_inquiry_open.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.member_inquiry_open.soundEligible).toBe(true);
    expect(ADMIN_ACTION_QUEUE_META.platform_inquiry_open.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.platform_inquiry_open.soundEligible).toBe(true);
    expect(ADMIN_ACTION_QUEUE_META.store_inquiry_open.soundEligible).toBe(false);
  });

  it("sound tables include Care + platform inquiry (T5)", () => {
    expect(isAdminSoundEligible("member_admin_note_threads")).toBe(true);
    expect(isAdminSoundEligible("platform_admin_inquiries")).toBe(true);
  });
});

describe("P0-C AdminOps bridge inquiry wiring (T4/T6)", () => {
  it("subscribes inquiry INSERT on AdminOpsRealtimeBridge only", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain('table: "member_admin_note_threads"');
    expect(provider).toContain('table: "platform_admin_inquiries"');
    expect(provider).toContain("ingestAdminRowSound");
    expect(provider).toContain("resolveAdminMemberCareInquiryHref");
    expect(provider).toContain("resolveAdminPlatformInquiryHref");
    expect(provider).toContain('startedBy === "member"');
    const carePage = read("components/admin/member-notes/AdminMemberNotesPage.tsx");
    expect(carePage).not.toContain("postgres_changes");
    const platformPage = read("components/admin/platform-inquiries/AdminPlatformInquiriesPage.tsx");
    expect(platformPage).not.toContain("postgres_changes");
  });
});

describe("P0-C exact deeplink (T7)", () => {
  it("Care admin href carries thread id", () => {
    expect(resolveAdminMemberCareInquiryHref("tid-1")).toBe(
      "/admin/member-notes?kind=inquiry&thread=tid-1"
    );
    expect(parseAdminMemberCareInquiryThreadId(new URLSearchParams("thread=tid-1"))).toBe("tid-1");
  });

  it("platform admin href carries request id", () => {
    expect(resolveAdminPlatformInquiryHref("inq-2")).toBe(
      "/admin/platform-inquiries?request=inq-2"
    );
    expect(
      parseAdminPlatformInquiryFocusRequestId(new URLSearchParams("request=inq-2"))
    ).toBe("inq-2");
  });

  it("member care return href is exact thread (T8)", () => {
    expect(resolveMemberCareInquiryHref("tid-9")).toBe("/mypage/inquiries/tid-9");
  });

  it("owner platform return href includes inquiry id (T11)", () => {
    expect(resolveOwnerPlatformInquiryHref("store-1", "inq-3")).toContain("inquiry=inq-3");
    expect(resolveOwnerPlatformInquiryHref("store-1", "inq-3")).toContain("storeId=store-1");
  });
});

describe("P0-C Admin → Member Care reply preserved (T8/T9)", () => {
  it("notifyMemberOfAdminNote still writes inquiry_answered", () => {
    const svc = read("lib/notifications/member-admin-notes-service.ts");
    expect(svc).toContain("notifyMemberOfAdminNote");
    expect(svc).toContain("inquiry_answered");
    expect(svc).toContain("createAndDispatchNotificationEvent");
  });
});

describe("P0-C Owner platform reply + account special (T11/T12)", () => {
  it("general platform reply notifies; account_request writer preserved", () => {
    const route = read("app/api/admin/platform-inquiries/[id]/route.ts");
    const writer = read("lib/notifications/notify-store-points.ts");
    expect(writer).toContain("notifyStoreOwnerPlatformInquiryReplied");
    expect(writer).toContain("notifyStoreOwnerPointAccountReplied");
    expect(writer).toContain('type: "inquiry_answered"');
    expect(route).toContain("notifyStoreOwnerPlatformInquiryReplied");
    expect(route).toContain("notifyStoreOwnerPointAccountReplied");
    expect(route).toContain("account_request");
  });
});

describe("P0-C sidebar section badge from Q (T1)", () => {
  it("cp-member-inquiry + cp-store-inbox use Admin Q projections", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain('item.key === "cp-member-inquiry"');
    expect(sidebar).toContain("memberInquiryOpenCount");
    expect(sidebar).toContain('item.key === "cp-store-inbox"');
    expect(sidebar).toContain("platformInquiryOpenCount");
  });
});

describe("P0-C migration for inquiry RT", () => {
  it("adds publication + admin SELECT policies", () => {
    const mig = read("supabase/migrations/20261129120000_admin_inquiry_ops_realtime.sql");
    expect(mig).toContain("member_admin_note_threads");
    expect(mig).toContain("platform_admin_inquiries");
    expect(mig).toContain("ADD TABLE");
    expect(mig).toContain("is_platform_admin");
  });
});
