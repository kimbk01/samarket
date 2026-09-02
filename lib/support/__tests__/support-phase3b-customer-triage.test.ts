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
    expect(read("components/support/SupportTriageFlow.tsx")).toContain(
      "data-support-triage-categories"
    );
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

  it("T12 solved guidance creates no case", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("onResolvedWithoutCase");
    expect(host).toContain("handleClose");
    const flow = read("components/support/SupportTriageFlow.tsx");
    expect(flow).toContain("GUIDANCE_RESOLVED");
    expect(flow).toContain("onResolvedWithoutCase");
    // create API only from handoff CTA
    expect(flow).toContain("data-support-triage-create");
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

  it("T14 summary required/validated", () => {
    const flow = read("components/support/SupportTriageFlow.tsx");
    expect(flow).toContain("summaryOk");
    expect(flow).toContain("!summaryOk");
  });

  it("T15 case created only at handoff CTA", () => {
    const flow = read("components/support/SupportTriageFlow.tsx");
    expect(flow).toContain("onCreateCase");
    expect(flow).toContain("data-support-triage-create");
    // SELECT_CATEGORY / ISSUE must not call create
    expect(flow).not.toMatch(/SELECT_CATEGORY[\s\S]{0,200}onCreateCase/);
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("requireIssueType: true");
    expect(host).toContain("handleCreateCase");
  });

  it("T16 ACTIVE exact case preserved", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("SupportActiveConversation");
    expect(host).toContain("showActive");
    expect(host).toContain("/api/support/cases/");
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
    const flow = read("components/support/SupportTriageFlow.tsx");
    expect(flow).toContain("labelForCategory");
    expect(flow).toContain("labelForIssue");
    expect(flow).not.toMatch(/>\s*PAYMENT_RECHARGE\s*</);
    expect(flow).not.toMatch(/>\s*POINT_CHARGE_NOT_REFLECTED\s*</);
  });

  it("T20 current message POST append preserved", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain('method: "POST"');
    expect(host).toContain("mergeSupportMessage");
    expect(host).toMatch(/\/api\/support\/cases\/\$\{encodeURIComponent\(caseId\)\}/);
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
