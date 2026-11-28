/**
 * 병합 전 L5 — 「매장으로」 바꿔 쓴 초안을 이어 쓰면 대상·매장·분야·세부가 초안대로 돌아온다 (동작).
 */
import { describe, expect, it } from "vitest";
import {
  applySupportTicketDraft,
  initSupportTicketForm,
  listSupportTicketCategories,
} from "@/lib/support/support-ticket-form";
import { listIssueTypesForCategory } from "@/lib/support/support-category-registry";
import { buildGenericSupportTriageContext } from "@/lib/support/support-context";

describe("병합 전 L5 — 대상이 다른 초안 이어 쓰기", () => {
  it("회원 화면 + 사장님 초안 → 사장님·매장·분야·세부·내용 그대로", () => {
    const memberState = initSupportTicketForm(
      buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" })
    );
    expect(memberState.audience).toBe("MEMBER");
    const ownerCat = listSupportTicketCategories({ audience: "OWNER", viewerHasStore: true })[0];
    const ownerIssue = listIssueTypesForCategory(ownerCat.id)[0];
    const next = applySupportTicketDraft(memberState, {
      audience: "OWNER",
      storeId: "store-1",
      category: ownerCat.id,
      issueType: ownerIssue.id,
      body: "매장 문의 초안",
      savedAt: "2026-11-28T00:00:00.000Z",
    });
    expect(next.audience).toBe("OWNER");
    expect(next.storeId).toBe("store-1");
    expect(next.category).toBe(ownerCat.id);
    expect(next.issueType).toBe(ownerIssue.id);
    expect(next.body).toBe("매장 문의 초안");
  });

  it("매장 정보 없는 사장님 초안 → 대상은 그대로(내용만)", () => {
    const memberState = initSupportTicketForm(
      buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" })
    );
    const next = applySupportTicketDraft(memberState, {
      audience: "OWNER",
      category: null,
      issueType: null,
      body: "내용만",
      savedAt: "2026-11-28T00:00:00.000Z",
    });
    expect(next.audience).toBe("MEMBER");
    expect(next.body).toBe("내용만");
  });
});
