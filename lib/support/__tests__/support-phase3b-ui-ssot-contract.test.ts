/**
 * Support Phase 3B — label / list / badge SSOT + D1 in-app notice
 * (docs/support-center/support-ui-notification-ssot-spec.md §3B, §3C D1).
 */
import { translate } from "@/lib/i18n/messages";
import { readFileSync } from "node:fs";
import { MESSAGES } from "@/lib/i18n/messages";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Catalog-backed safeT stand-in (returns the KO catalog value, else the KO fallback). */
const ko = supportUiMessages.ko as Record<string, string>;
/** 언어 SSOT S6: 실제 safeT 처럼 대체 문구는 선택 — 호출부가 대체 문구를 넘기지 않는다 */
const safeT = (key: string, opts?: { fallbackKo?: string }) =>
  ko[key] ?? (MESSAGES.ko as unknown as Record<string, string>)[key] ?? opts?.fallbackKo ?? key;

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
    const views = read("components/support/SupportTicketViews.tsx");
    const hist = read("components/support/SupportCasesHistoryList.tsx");
    const enter = read("components/support/SupportCenterEnterClient.tsx");
    expect(views).toContain("supportErrorLabel(safeT, error)");
    expect(views).toContain("supportErrorLabel(safeT, submitError)");
    expect(views).toContain("supportErrorLabel(safeT, actionError)");
    expect(views).not.toMatch(/\{error\}<\/p>/);
    expect(views).toContain("supportReferenceLabel(safeT, state.referenceType)");
    expect(views).not.toMatch(/\{state\.referenceType\}/);
    expect(hist).toContain('supportErrorLabel(safeT, "load_failed")');
    expect(hist).not.toContain("c.subject");
    expect(enter).not.toContain("(${error})");
  });
});

describe("B1 admin vocabulary — one SSOT for status / role / priority", () => {
  it("every status maps to Korean admin wording", () => {
    const expected: Record<string, string> = {
      // 전체 수정 계약 §7 (2026-11-28): 어드민 OPEN = 「답변 필요」(탭과 같은 이름)
      OPEN: "답변 필요",
      WAITING_ADMIN: "답변 필요",
      // UI U7 (2026-11-27): 탭·알약 같은 이름
      WAITING_USER: "고객 확인 대기",
      RESOLVED: "종료",
      ARCHIVED: "보관",
    };
    for (const s of SUPPORT_CASE_STATUSES) expect(supportAdminStatusLabel(s, (k) => translate("ko", k))).toBe(expected[s]);
    expect(supportAdminStatusLabel("weird", (k) => translate("ko", k))).toBe("확인 필요");
    expect(supportAudienceLabel("OWNER", (k) => translate("ko", k))).toBe("사장님");
    expect(supportAudienceLabel("MEMBER", (k) => translate("ko", k))).toBe("회원");
    expect(supportPriorityLabel("URGENT", (k) => translate("ko", k))).toBe("긴급");
  });

  it("admin page reads the SSOT (no local maps, no raw enums) (구조 확인)", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    expect(page).not.toMatch(/function statusLabel\(/);
    expect(page).not.toMatch(/function roleLabel\(/);
    expect(page).not.toContain("humanizeToken");
    expect(page).toContain("supportAdminStatusLabel");
    expect(page).toContain("supportReferenceLabel(safeT, activeCase.reference_type)");
    expect(page).not.toContain("· {activeCase.priority}");
    // 최종 점검 L11: control-plane 읽기 모델은 호출처 0 이라 삭제됨
  });

  it("B7 queue Realtime is queue-wide; search is debounced", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    // 전체 수정 계약 §4 B-5: 콘솔은 자기 채널 없이 공통 구독 이벤트로 받는다 (동작 시험: support-admin-full-fix-2026-11-28.test.tsx)
    expect(page).toContain("subscribeAdminSupportCaseChange(");
    expect(page).not.toContain('.channel("admin-support-queue"');
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

  it("고객센터 답변 숫자 = 고객센터 FAB 아이콘에만 (Owner 2026-11-10) — 허브·탭 행에는 없음", () => {
    const hook = read("lib/support/use-support-requester-unread.ts");
    expect(hook).toContain("fetchSupportRequesterUnread(");
    // 최종 감사 L10: 숫자 전용 응답(목록 전체 대신) — 요청은 공유 모듈 하나
    expect(hook).toContain('summary: "unread"');
    expect(read("lib/support/support-requester-unread-fetch.ts")).toContain("/api/support/cases?");
    // A-6 (2026-11-29): 숫자 열 + 매장 소유 확인용 열만(동작 시험 support-full-fix-server-2026-11-29)
    expect(read("lib/support/support-case-service.ts")).toContain('.select("requester_unread_count, audience, owner_store_id")');
    const fab = read("components/support/SupportFab.tsx");
    expect(fab).toContain("useSupportRequesterUnread({");
    expect(fab).toContain('audience: owner ? "OWNER" : "MEMBER"');
    expect(fab).toContain('data-support-fab-badge="1"');
    const hub = read("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(hub).not.toContain("useSupportRequesterUnread");
    const care = read("components/business/owner/OwnerCustomerCareHubView.tsx");
    expect(care).not.toContain("useSupportRequesterUnread");
    expect(care).not.toContain("noteUnread(");
    const center = read("components/business/owner/OwnerCustomerCenterView.tsx");
    expect(center).not.toContain("useSupportRequesterUnread");
  });

  it("B8 admin archive is readable; B9 dashboard tile uses support_actionable", () => {
    const archive = read("components/admin/support/AdminSupportArchivePage.tsx");
    expect(archive).toContain("data-admin-archive-thread");
    expect(archive).toContain("legacyStatusLabel(n.status, t)");
    expect(archive).not.toMatch(/method:\s*"(POST|PATCH)"/);
    const tiles = read("components/admin/order-notifications/AdminOrderNotificationsPageClient.tsx");
    expect(tiles).toContain("AdminActionQueueCardGrid");
    const registry = read("lib/admin/admin-action-queue-registry.ts");
    expect(registry).toContain('listHref: "/admin/support?filter=ACTIONABLE#action-required"');
    expect(registry).not.toContain('"/admin/platform-inquiries"');
  });
});

describe("접수형 문의 — 앱 사용 중 고객센터 배너 없음 (Owner 2026-11-10)", () => {
  it("고객센터 배너 호스트·실시간 연결이 없다 — 답변은 고객센터 FAB 숫자로만", () => {
    expect(read("components/layout/ConditionalAppShell.tsx")).not.toContain("SupportInAppNoticeHost");
    expect(read("components/notifications/NotificationsBadgeRealtimeBridge.tsx")).not.toContain(
      "pushSupportInAppNoticeFromRealtimeRow"
    );
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
    // 고객 문의 SSOT §4 (F11): FAB 숫자는 고객지원 알림이 왔을 때만 다시 읽는다
    expect(read("lib/support/use-support-requester-unread.ts")).toContain("SUPPORT_NOTIFICATION_ARRIVED_EVENT");
    expect(read("lib/support/use-support-requester-unread.ts")).not.toContain("KASAMA_NOTIFICATIONS_UPDATED");
  });
});

