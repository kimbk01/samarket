/**
 * 고객센터 접수형 2단계 (Owner 「2단계 진행」 2026-11-10) — 주문 문제는 매장으로.
 * - 고객 분야 목록에서 「주문」 제외(서버 판정·지난 문의 호환은 유지)
 * - 주문 화면 문의 = 신고 › 매장 신고(주문 분쟁) + 관련 주문, 맨 위 「매장에 문의하기(주문 채팅)」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import {
  getSupportCategoryDefinition,
  validateSupportCategoryForOpen,
} from "@/lib/support/support-category-registry";
import {
  SUPPORT_TICKET_STORE_ORDER_CATEGORY,
  SUPPORT_TICKET_STORE_ORDER_ISSUE,
  buildSupportTicketOpenPayload,
  initSupportTicketForm,
  isSupportTicketStoreOrderEntry,
  listSupportTicketCategories,
  setSupportTicketBody,
} from "@/lib/support/support-ticket-form";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const orderCtx = (chat?: string) =>
  buildMemberSupportContext({
    enabled: true,
    category: SUPPORT_TICKET_STORE_ORDER_CATEGORY,
    issueType: SUPPORT_TICKET_STORE_ORDER_ISSUE,
    sourceSurface: "mypage_store_order_detail",
    referenceType: "STORE_ORDER",
    referenceId: "00000000-0000-4000-8000-000000000001",
    referenceTitle: "A1B2 · 치킨집",
    storeChatHref: chat,
  });

describe("주문 문제는 매장으로", () => {
  it("고객 분야 목록에 「주문」이 없다(매장 유무와 무관), 사장님 분야는 그대로", () => {
    for (const hasStore of [true, false]) {
      expect(listSupportTicketCategories({ audience: "MEMBER", viewerHasStore: hasStore }).map((c) => c.id)).not.toContain(
        "ORDER"
      );
    }
    expect(listSupportTicketCategories({ audience: "OWNER", viewerHasStore: true }).map((c) => c.id)).toContain(
      "ORDER_DELIVERY"
    );
  });

  it("서버는 지난 문의·옛 호출 호환을 위해 ORDER 를 계속 받는다", () => {
    expect(validateSupportCategoryForOpen({ audience: "MEMBER", category: "ORDER", issueType: "ORDER_STATUS" }).ok).toBe(true);
  });

  it("신고에 「매장 신고(주문 분쟁)」 세부와 주문 참조가 있다", () => {
    const report = getSupportCategoryDefinition("REPORT")!;
    expect(report.issueTypes.map((i) => i.id)).toContain("STORE_ORDER_DISPUTE");
    expect(report.allowedReferenceTypes).toContain("STORE_ORDER");
    expect(MESSAGES.ko.support_issue_report_store_order).toBe("매장 신고 (주문 분쟁)");
    expect(
      validateSupportCategoryForOpen({ audience: "MEMBER", category: "REPORT", issueType: "STORE_ORDER_DISPUTE" }).ok
    ).toBe(true);
  });

  it("주문 화면 진입 = 신고 고정 · 세부 미리 선택 · 관련 주문 · 매장 채팅 주소(접수 요청에는 안 들어감)", () => {
    let s = initSupportTicketForm(orderCtx("/orders/store/x/chat"));
    expect(s.category).toBe("REPORT");
    expect(s.categoryLocked).toBe(true);
    expect(s.issueType).toBe("STORE_ORDER_DISPUTE");
    expect(s.referenceType).toBe("STORE_ORDER");
    expect(s.storeChatHref).toBe("/orders/store/x/chat");
    expect(isSupportTicketStoreOrderEntry(s)).toBe(true);
    s = setSupportTicketBody(s, "매장이 답이 없어요");
    const p = buildSupportTicketOpenPayload(s)!;
    expect(p.issueType).toBe("STORE_ORDER_DISPUTE");
    expect(p.context.referenceType).toBe("STORE_ORDER");
    expect(JSON.stringify(p)).not.toContain("storeChatHref");
  });

  it("채팅을 열 수 없는 주문(취소)은 채팅 주소 없음 → 안내 문구만", () => {
    const s = initSupportTicketForm(orderCtx(undefined));
    expect(s.storeChatHref).toBeUndefined();
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toContain('t("support_ticket_store_first_chat_closed")');
    expect(v).toContain('data-support-ticket-store-chat="1"');
  });

  it("주문 상세·주문 허브 펼침 둘 다 같은 계약 — ORDER 를 보내지 않는다", () => {
    for (const f of ["components/mypage/MyStoreOrderDetailView.tsx", "components/mypage/MyStoreOrderExpandPanel.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("category: SUPPORT_TICKET_STORE_ORDER_CATEGORY");
      expect(src, f).toContain("issueType: SUPPORT_TICKET_STORE_ORDER_ISSUE");
      expect(src, f).toContain("storeChatHref:");
      expect(src, f).not.toContain('category: "ORDER"');
    }
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("onOpenStoreChat={(href) => {");
  });
});
