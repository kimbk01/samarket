/**
 * PHASE 3-B — Customer triage / guidance / handoff contract tests (T1–T20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGenericSupportTriageContext,
  buildMemberSupportContext,
  buildOwnerSupportContext,
} from "@/lib/support/support-context";
import {
  listSelectableSupportCategories,
} from "@/lib/support/support-category-registry";
import {
  buildTriageOpenContext,
  initSupportTriageFromContext,
  supportTriageReducer,
} from "@/lib/support/support-triage-model";
import { assertGuidanceOpenConsistency } from "@/lib/support/support-guidance-authority";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PHASE 3-B support customer triage", () => {
  it("T1 generic entry shows category picker", () => {
    const ctx = buildGenericSupportTriageContext({
      audience: "MEMBER",
      sourceSurface: "mypage_customer_center",
    });
    const state = initSupportTriageFromContext(ctx);
    expect(state.step).toBe("START_CATEGORY");
    expect(state.category).toBeNull();
    // 접수형 한 화면: 분야 행 → 분야 선택 목록
    expect(read("components/support/SupportTicketViews.tsx")).toContain('setView("pick_category")');
  });

  it("T2 generic entry does not auto OTHER", () => {
    const ctx = buildGenericSupportTriageContext({
      audience: "MEMBER",
      sourceSurface: "mypage_customer_center",
    });
    expect(ctx.category).toBe("");
    expect(ctx.needsCategorySelection).toBe(true);
    const state = initSupportTriageFromContext(ctx);
    expect(state.category).not.toBe("OTHER");
    expect(state.explicitOtherSelection).toBe(false);
  });

  it("T3 explicit OTHER allowed", () => {
    let state = initSupportTriageFromContext(
      buildGenericSupportTriageContext({
        audience: "MEMBER",
        sourceSurface: "mypage_customer_center",
      })
    );
    state = supportTriageReducer(state, {
      type: "SELECT_CATEGORY",
      categoryId: "OTHER",
    });
    expect(state.category).toBe("OTHER");
    expect(state.explicitOtherSelection).toBe(true);
    expect(state.step).toBe("START_ISSUE");
  });

  it("T4 audience category filtering", () => {
    const member = listSelectableSupportCategories("MEMBER").map((c) => c.id);
    const owner = listSelectableSupportCategories("OWNER").map((c) => c.id);
    expect(member).toContain("PAYMENT_RECHARGE");
    expect(member).not.toContain("STORE");
    expect(owner).toContain("STORE");
    expect(owner).not.toContain("PAYMENT_RECHARGE");
  });

  it("T5 category→issue exact", () => {
    let state = initSupportTriageFromContext(
      buildGenericSupportTriageContext({
        audience: "MEMBER",
        sourceSurface: "mypage_customer_center",
      })
    );
    state = supportTriageReducer(state, {
      type: "SELECT_CATEGORY",
      categoryId: "ORDER",
    });
    state = supportTriageReducer(state, {
      type: "SELECT_ISSUE",
      issueType: "ORDER_STATUS",
    });
    expect(state.step).toBe("GUIDANCE");
    expect(state.issueType).toBe("ORDER_STATUS");
  });

  it("T6 contextual category prefill", () => {
    const state = initSupportTriageFromContext(
      buildMemberSupportContext({
        enabled: true,
        category: "PAYMENT_RECHARGE",
        sourceSurface: "mypage_points_charge",
      })
    );
    expect(state.step).toBe("START_ISSUE");
    expect(state.category).toBe("PAYMENT_RECHARGE");
    expect(state.categoryLocked).toBe(true);
  });

  it("T7 contextual issue picker", () => {
    const state = initSupportTriageFromContext(
      buildMemberSupportContext({
        enabled: true,
        category: "GIFT_CERTIFICATE",
        sourceSurface: "gift_instance",
        referenceType: "GIFT_INSTANCE",
        referenceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      })
    );
    expect(state.step).toBe("START_ISSUE");
    expect(state.referenceType).toBe("GIFT_INSTANCE");
  });

  it("T8 invalid issue blocked", () => {
    const state = initSupportTriageFromContext(
      buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "order",
      })
    );
    const next = supportTriageReducer(state, {
      type: "SELECT_ISSUE",
      issueType: "POINT_CHARGE_HOW_TO",
    });
    expect(next.issueType).toBeNull();
    expect(next.step).toBe("START_ISSUE");
  });

  it("T9 guidance match exact", () => {
    expect(
      assertGuidanceOpenConsistency({
        entry: {
          id: "g1",
          audience: "MEMBER",
          category: "ORDER",
          issue_type: "ORDER_STATUS",
          enabled: true,
          revision: 1,
        },
        audience: "MEMBER",
        category: "ORDER",
        issueType: "ORDER_STATUS",
        guidanceKey: "g1",
        guidanceRevision: 1,
      })
    ).toEqual({ ok: true });
  });

  it("T10 guidance mismatch blocked", () => {
    expect(
      assertGuidanceOpenConsistency({
        entry: {
          id: "g1",
          audience: "MEMBER",
          category: "ORDER",
          issue_type: "ORDER_STATUS",
          enabled: true,
          revision: 1,
        },
        audience: "MEMBER",
        category: "ORDER",
        issueType: "MISSING_ITEM",
        guidanceKey: "g1",
      }).ok
    ).toBe(false);
  });

  it("T11 no guidance still handoff possible", () => {
    let state = initSupportTriageFromContext(
      buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "order",
      })
    );
    state = supportTriageReducer(state, {
      type: "SELECT_ISSUE",
      issueType: "ORDER_STATUS",
    });
    state = supportTriageReducer(state, { type: "GUIDANCE_LOADED", entry: null });
    expect(state.guidanceEmpty).toBe(true);
    state = supportTriageReducer(state, { type: "GUIDANCE_ESCALATE" });
    expect(state.step).toBe("HANDOFF_SUMMARY");
  });

  it("T12 접수형: 안내 단계 없음 — 닫기는 문의를 만들지 않는다", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("handleClose");
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).not.toContain("GUIDANCE_RESOLVED");
    // create API only from 「문의 접수」 button
    expect(views).toContain("data-support-ticket-submit");
  });

  it("T13 escalated guidance carries metadata", () => {
    let state = initSupportTriageFromContext(
      buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "order",
      })
    );
    state = supportTriageReducer(state, {
      type: "SELECT_ISSUE",
      issueType: "ORDER_STATUS",
    });
    state = supportTriageReducer(state, {
      type: "GUIDANCE_LOADED",
      entry: {
        id: "g1",
        audience: "MEMBER",
        category: "ORDER",
        issue_type: "ORDER_STATUS",
        title: "t",
        body: "b",
        enabled: true,
        sort_order: 0,
        cta_kind: "NONE",
        cta_target: null,
        escalation_allowed: true,
        revision: 3,
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
      },
    });
    state = supportTriageReducer(state, { type: "GUIDANCE_ESCALATE" });
    expect(state.guidanceOutcome).toBe("ESCALATED_TO_HUMAN");
    expect(state.guidance?.id).toBe("g1");
    expect(state.guidance?.revision).toBe(3);
  });

  it("T14 내용 필수 — 비면 문의 접수 비활성", () => {
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).toContain("canSubmitSupportTicket(state)");
    expect(views).toContain("disabled={!canSubmit}");
  });

  it("T15 문의는 「문의 접수」에서만 만든다", () => {
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).toContain("onSubmit(state, draftKey)");
    expect(views).toContain("data-support-ticket-submit");
    // 분야·세부 선택은 접수를 부르지 않는다
    expect(views).not.toMatch(/selectSupportTicketCategory[\s\S]{0,200}onSubmit\(/);
    const form = read("lib/support/support-ticket-form.ts");
    expect(form).toContain("requireIssueType: true");
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("handleSubmit");
    expect(host).toContain('fetch("/api/support/cases/open"');
  });

  it("T16 caseId 로 열면 그 문의 상세(질문·답변)", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("SupportTicketDetail");
    expect(host).toContain("modal.caseId");
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).toContain("/api/support/cases/");
  });

  it("T17 RESOLVED new inquiry → generic triage", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("buildGenericSupportTriageContext");
    expect(host).toContain("handleNewInquiry");
    const ctrl = read("lib/support/support-modal-controller.ts");
    expect(ctrl).toContain("needsCategorySelection");
  });

  it("T18 legacy contextual caller compatibility", () => {
    const state = initSupportTriageFromContext(
      buildOwnerSupportContext({
        enabled: true,
        category: "BANK_ACCOUNT",
        sourceSurface: "owner_basic_info",
        storeId: "store-1",
      })
    );
    expect(state.category).toBe("CASH_COIN");
    expect(state.step).toBe("START_ISSUE");
    // open path still allows missing issue for non-triage callers
    const open = read("app/api/support/cases/open/route.ts");
    expect(open).toContain("allowMissingIssue");
  });

  it("T19 raw enums absent UI contract", () => {
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).toContain("supportTicketCategoryLabel");
    expect(views).toContain("supportTicketIssueLabel");
    expect(views).not.toMatch(/>\s*PAYMENT_RECHARGE\s*</);
    expect(views).not.toMatch(/>\s*POINT_CHARGE_NOT_REFLECTED\s*</);
  });

  it("T20 추가 문의·확인했어요 = 같은 문의 POST", () => {
    const views = read("components/support/SupportTicketViews.tsx");
    expect(views).toContain('method: "POST"');
    expect(views).toContain('JSON.stringify({ action: "close" })');
    expect(views).toMatch(/\/api\/support\/cases\/\$\{encodeURIComponent\(caseId\)\}/);
  });

  it("buildTriageOpenContext carries explicit OTHER", () => {
    let state = initSupportTriageFromContext(
      buildGenericSupportTriageContext({
        audience: "MEMBER",
        sourceSurface: "mypage_customer_center",
      })
    );
    state = supportTriageReducer(state, {
      type: "SELECT_CATEGORY",
      categoryId: "OTHER",
    });
    state = supportTriageReducer(state, {
      type: "SELECT_ISSUE",
      issueType: "GENERAL",
    });
    const openCtx = buildTriageOpenContext(state);
    expect(openCtx.category).toBe("OTHER");
    expect(openCtx.explicitOtherSelection).toBe(true);
  });
});
