/**
 * Support Phase 3B — label / list / badge SSOT + D1 in-app notice
 * (docs/support-center/support-ui-notification-ssot-spec.md §3B, §3C D1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { supportUiMessages } from "@/lib/i18n/catalog/support-ui";
import { SUPPORT_REFERENCE_TYPES } from "@/lib/support/support-reference-authority";
import {
  supportErrorLabel,
  supportReferenceLabel,
} from "@/lib/support/support-display-labels";
import {
  supportAdminStatusLabel,
  supportAudienceLabel,
  supportPriorityLabel,
} from "@/lib/support/support-status-label";
import { SUPPORT_CASE_STATUSES } from "@/lib/support/support-case-types";
import {
  dismissSupportInAppNotice,
  getSupportInAppNotice,
  pushSupportInAppNoticeFromRealtimeRow,
} from "@/lib/support/support-in-app-notice";
import { closeSupportModal, openSupportModal } from "@/lib/support/support-modal-controller";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Catalog-backed safeT stand-in (returns the KO catalog value, else the KO fallback). */
const ko = supportUiMessages.ko as Record<string, string>;
const safeT = (key: string, opts: { fallbackKo: string }) => ko[key] ?? opts.fallbackKo;

describe("B3 reference labels — every reference type has KO+EN copy", () => {
  it("no raw enum leaks", () => {
    for (const t of SUPPORT_REFERENCE_TYPES) {
      const label = supportReferenceLabel(safeT as never, t);
      expect(label, t).not.toBe(t);
      expect(label, t).not.toMatch(/^[A-Z_]+$/);
      const key = `support_ref_${t.toLowerCase()}`;
      expect(ko[key], key).toBeTruthy();
      expect((supportUiMessages.en as Record<string, string>)[key], key).toBeTruthy();
    }
    expect(supportReferenceLabel(safeT as never, "SOMETHING_NEW")).toBe("관련 항목");
  });
});

describe("B2 error labels — customers never see an API code", () => {
  it("maps known and unknown codes to copy", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "not_found",
      "case_closed",
      "active_case_exists",
      "missing_context",
      "network_error",
      "load_failed",
      "open_failed",
      "http_500",
      "PGRST116 something",
    ]) {
      const label = supportErrorLabel(safeT as never, code);
      expect(label, code).not.toContain(code);
      expect(label.length, code).toBeGreaterThan(3);
    }
  });

  it("customer surfaces render errors / reference types through the label SSOT", () => {
    const host = read("components/support/SupportModalHost.tsx");
    const flow = read("components/support/SupportTriageFlow.tsx");
    const hist = read("components/support/SupportCasesHistoryList.tsx");
    const enter = read("components/support/SupportCenterEnterClient.tsx");
    expect(host).toContain("supportErrorLabel(safeT, error)");
    expect(host).not.toMatch(/\{error\}<\/p>/);
    expect(flow).toContain("supportErrorLabel(safeT, guidanceError)");
    expect(flow).toContain("supportErrorLabel(safeT, startError)");
    expect(flow).not.toMatch(/\{state\.referenceType\}/);
    expect(hist).toContain("supportErrorLabel(safeT, error)");
    expect(hist).not.toContain("c.subject");
    expect(enter).not.toContain("(${error})");
  });
});

describe("B1 admin vocabulary — one SSOT for status / role / priority", () => {
  it("every status maps to Korean admin wording", () => {
    const expected: Record<string, string> = {
      OPEN: "접수",
      WAITING_ADMIN: "답변 대기",
      WAITING_USER: "사용자 답변 대기",
      RESOLVED: "종료",
      ARCHIVED: "보관",
    };
    for (const s of SUPPORT_CASE_STATUSES) expect(supportAdminStatusLabel(s, true)).toBe(expected[s]);
    expect(supportAdminStatusLabel("weird", true)).toBe("확인 필요");
    expect(supportAudienceLabel("OWNER", true)).toBe("사장님");
    expect(supportAudienceLabel("MEMBER", true)).toBe("회원");
    expect(supportPriorityLabel("URGENT", true)).toBe("긴급");
  });

  it("admin page / control plane read the SSOT (no local maps, no raw enums)", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).not.toMatch(/function statusLabel\(/);
    expect(page).not.toMatch(/function roleLabel\(/);
    expect(page).not.toContain("humanizeToken");
    expect(page).toContain("supportAdminStatusLabel");
    expect(page).toContain("supportReferenceLabel(safeT, activeCase.reference_type)");
    expect(page).not.toContain("· {activeCase.priority}");
    const plane = read("components/admin/support/AdminSupportControlPlane.tsx");
    expect(plane).not.toContain("adminOperatorLabel");
    expect(plane).not.toContain("{item.category}");
    expect(plane).not.toContain('(ko ? "Owner" : "Owner")');
    const loader = read("lib/admin/support-control-plane/load-support-control-plane.ts");
    expect(loader).toContain("subject: c.initial_summary || c.public_case_no");
  });

  it("B7 queue Realtime is queue-wide; search is debounced", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).toContain('.channel("admin-support-queue")');
    expect(page).not.toContain("filter: `case_id=eq.${activeId}`");
    expect(page).toContain("setAppliedSearch(search), 300");
  });
});

describe("B4/B5/B6 lists and badges", () => {
  it("member archive shows 1:1 and admin-note sections on one page", () => {
    const list = read("components/mypage/cs/MemberCsNoteListClient.tsx");
    expect(list).toContain('["inquiry", "inbox"]');
    expect(list).toContain("biz_care_tab_1on1");
    expect(list).toContain("biz_care_tab_admin_messages");
    expect(list).toContain("support_status_unknown");
    expect(list).not.toMatch(/:\s*th\.status\}/);
  });

  it("entry badges read requester unread from support cases (not legacy notes)", () => {
    const hook = read("lib/support/use-support-requester-unread.ts");
    expect(hook).toContain("/api/support/cases?");
    expect(hook).toContain("requester_unread_count");
    const hub = read("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(hub).toContain('useSupportRequesterUnread({ audience: "MEMBER" })');
    const care = read("components/business/owner/OwnerCustomerCareHubView.tsx");
    expect(care).toContain('audience: "OWNER"');
    expect(care).not.toContain("noteUnread(");
    const center = read("components/business/owner/OwnerCustomerCenterView.tsx");
    expect(center).toContain("badge: historyBadge");
  });

  it("B8 admin archive is readable; B9 dashboard tile uses support_actionable", () => {
    const archive = read("components/admin/support/AdminSupportArchivePage.tsx");
    expect(archive).toContain("data-admin-archive-thread");
    expect(archive).toContain("legacyStatusLabel(n.status, ko)");
    expect(archive).not.toMatch(/method:\s*"(POST|PATCH)"/);
    const tiles = read("components/admin/order-notifications/AdminOrderNotificationsPageClient.tsx");
    expect(tiles).toContain("c?.support_actionable");
    expect(tiles).not.toContain('href: "/admin/platform-inquiries"');
  });
});

describe("D1 in-app notice", () => {
  afterEach(() => {
    dismissSupportInAppNotice();
    closeSupportModal();
  });

  const row = (type: string, caseId = "c-1") => ({
    id: "n-1",
    type,
    link_url: `/support/cases/${caseId}`,
    body: "관리자 답변 본문",
  });

  it("requester support events raise the banner; others do not", () => {
    expect(pushSupportInAppNoticeFromRealtimeRow(row("support_admin_replied"))).toBe(true);
    expect(getSupportInAppNotice()?.caseId).toBe("c-1");
    expect(getSupportInAppNotice()?.preview).toBe("관리자 답변 본문");
    dismissSupportInAppNotice();
    for (const t of ["support_customer_replied", "chat_message", "order_status", "support_case_created"]) {
      expect(pushSupportInAppNoticeFromRealtimeRow(row(t)), t).toBe(false);
    }
    expect(
      pushSupportInAppNoticeFromRealtimeRow({ ...row("support_admin_replied"), link_url: "/admin/support/x" })
    ).toBe(false);
  });

  it("no banner while the customer is already viewing that case", () => {
    openSupportModal({ caseId: "c-1" });
    expect(pushSupportInAppNoticeFromRealtimeRow(row("support_admin_replied", "c-1"))).toBe(false);
    expect(pushSupportInAppNoticeFromRealtimeRow(row("support_admin_replied", "c-2"))).toBe(true);
  });

  it("host is mounted once in the app shell and wired to the existing Realtime bridge", () => {
    expect(read("components/layout/ConditionalAppShell.tsx")).toContain("<SupportInAppNoticeHost />");
    expect(read("components/notifications/NotificationsBadgeRealtimeBridge.tsx")).toContain(
      "pushSupportInAppNoticeFromRealtimeRow(row)"
    );
    const host = read("components/support/SupportInAppNoticeHost.tsx");
    expect(host).toContain('source: "banner"');
    expect(host).not.toContain("community-messenger");
  });
});

describe("Console measured fixes (production QA 2026-10-05)", () => {
  it("narrow screens switch list ⇄ conversation; info is a drawer; no duplicate first-message box", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).toContain('${activeId ? "hidden lg:flex" : "flex"}');
    expect(page).toContain('${activeId ? "flex" : "hidden lg:flex"}');
    expect(page).toContain("data-admin-support-back");
    expect(page).not.toContain("처음 문의 내용");
  });

  it("support notifications are badged 고객센터 and hub unread refreshes on new notifications", () => {
    expect(read("lib/notifications/notification-inbox-surface-label.ts")).toContain("notif_surface_support");
    expect((supportUiMessages.ko as Record<string, string>).notif_surface_support).toBe("고객센터");
    expect(read("lib/support/use-support-requester-unread.ts")).toContain("KASAMA_NOTIFICATIONS_UPDATED");
  });
});

