/**
 * 고객 문의 UI 불일치 U1~U9 수정 (시안 docs/audit/customer-support-inquiry-reaudit-2026-11-27/ui-mockup.html 5절 ·
 * Owner 「권장안대로」 2026-11-27) 회귀 잠금.
 */
import "@/lib/i18n/admin-catalog";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import { supportAdminStatusLabel, supportRequesterStatusPill } from "@/lib/support/support-status-label";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("UI U1·U2 — 고객 상태 알약 단일 정의 (색 = 상태)", () => {
  it("상태별 문구·색 (동작)", () => {
    expect(supportRequesterStatusPill("WAITING_USER", 1)).toMatchObject({ key: "support_status_active", tone: "answered" });
    expect(supportRequesterStatusPill("OPEN", 0)).toMatchObject({ key: "support_status_waiting_admin", tone: "waiting" });
    expect(supportRequesterStatusPill("WAITING_ADMIN", 0)).toMatchObject({ tone: "waiting" });
    expect(supportRequesterStatusPill("RESOLVED", 1)).toMatchObject({ key: "support_status_new_reply", tone: "answered" });
    expect(supportRequesterStatusPill("ARCHIVED", 0)).toMatchObject({ key: "support_status_resolved", tone: "closed" });
    expect(supportRequesterStatusPill("WAITING_USER", 0).className).toBe("bg-sam-primary-soft text-sam-primary");
    expect(supportRequesterStatusPill("OPEN", 0).className).toBe("bg-sam-warning-soft text-sam-fg");
    expect(supportRequesterStatusPill("RESOLVED", 0).className).toBe("bg-sam-surface-muted text-sam-muted");
    expect((MESSAGES.ko as Record<string, string>).support_status_new_reply).toBe("새 답변");
    expect((MESSAGES.en as Record<string, string>).support_status_new_reply).toBe("New reply");
  });

  it("(구조 확인) 상세 상태 줄·쓰기 화면 진행 중 목록·내 문의 목록이 모두 같은 정의를 쓴다", () => {
    const views = src("components/support/SupportTicketViews.tsx");
    expect(views).toContain("tagClassName={supportRequesterStatusPill(supportCase.status, supportCase.requester_unread_count).className}");
    expect(views).toContain("supportRequesterStatusPill(c.status, c.requester_unread_count).className");
    expect(src("components/support/SupportCasesHistoryList.tsx")).toContain(
      "supportRequesterStatusPill(c.status, c.requester_unread_count)"
    );
  });
});

describe("UI U3~U9", () => {
  it("(구조 확인) U3 내 문의 행 시각 = 마지막 글 시각", () => {
    const hist = src("components/support/SupportCasesHistoryList.tsx");
    expect(hist).toContain("formatMypageDate(c.last_message_at");
    expect(hist).not.toContain("formatMypageDate(c.created_at");
  });

  it("(구조 확인) U4·U5 사장님 문의 CTA = 갈색 단일 정의 · 사장님 목록 카드 · 빈 목록은 안내만", () => {
    expect(src("lib/support/support-owner-cta.ts")).toContain("bg-[var(--dibay-brown)]");
    expect(src("components/business/owner/OwnerCustomerCenterView.tsx")).toContain("buttonClassName={OWNER_SUPPORT_CTA_CLASS}");
    const hist = src("components/support/SupportCasesHistoryList.tsx");
    expect(hist).toContain('data-support-cases-history-empty="1"');
    // Owner 「아래 것 빼기」(2026-11-27): 사장님 빈 목록에는 버튼 없음 — 위쪽 「문의하기」 1개만
    expect(hist).not.toContain("OWNER_SUPPORT_CTA_CLASS");
    expect(hist.match(/rounded-ui-rect border border-sam-border-soft bg-sam-surface/g)?.length).toBe(2);
  });

  it("(구조 확인) U6·U9 문의 창 버튼은 모두 44px·4px 하나의 모양", () => {
    const views = src("components/support/SupportTicketViews.tsx");
    expect(views).toContain('const SUPPORT_BTN = "w-full !min-h-11 !rounded-ui-rect";');
    const buttons = views.match(/<DibayOverlayButton[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(10);
    for (const b of buttons) expect(b).toContain("SUPPORT_BTN");
  });

  it("U7 어드민 WAITING_USER 이름 하나 (동작)", () => {
    expect(supportAdminStatusLabel("WAITING_USER", true)).toBe("고객 확인 대기");
    expect((MESSAGES.ko as Record<string, string>).admin_waiting_customer).toBe("고객 확인 대기");
  });
});
