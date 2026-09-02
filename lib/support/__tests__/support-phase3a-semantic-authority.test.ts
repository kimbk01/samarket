/**
 * PHASE 3-A — Support semantic authority contract tests (T1–T20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEMBER_SUPPORT_CATEGORIES,
  OWNER_SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_REGISTRY,
  isValidSupportIssueForCategory,
  listSelectableSupportCategories,
  resolveCanonicalSupportCategoryId,
  validateSupportCategoryForOpen,
} from "@/lib/support/support-category-registry";
import {
  classifySupportCaseOperational,
  isSupportCaseActionable,
  isSupportCaseInAllView,
  isSupportCaseInProgress,
  isSupportCasePreHandling,
  isSupportCaseResolved,
} from "@/lib/support/admin-support-queue-policy";
import {
  assertGuidanceOpenConsistency,
  validateSupportGuidanceCta,
} from "@/lib/support/support-guidance-authority";
import { shouldStampFirstAdminResponseAt } from "@/lib/support/support-first-admin-response";
import { assertSupportGenericHubCategoryPolicy } from "@/lib/support/support-generic-hub-policy";
import { SUPPORT_REFERENCE_TYPES } from "@/lib/support/support-reference-authority";
import { normalizeSupportContextForCase } from "@/lib/support/support-reference-authority";
import { buildMemberSupportContext } from "@/lib/support/support-context";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PHASE 3-A support semantic authority", () => {
  it("T1 category registry unique IDs", () => {
    const ids = SUPPORT_CATEGORY_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("T2 audience eligibility", () => {
    const member = listSelectableSupportCategories("MEMBER").map((c) => c.id);
    const owner = listSelectableSupportCategories("OWNER").map((c) => c.id);
    expect(member).toContain("PAYMENT_RECHARGE");
    expect(member).not.toContain("STORE");
    expect(owner).toContain("STORE");
    expect(owner).not.toContain("PAYMENT_RECHARGE");
    expect(member).not.toContain("DELIVERY");
    expect(member).not.toContain("REFUND");
    expect(owner).not.toContain("RECHARGE");
    expect(owner).not.toContain("BANK_ACCOUNT");
    expect(owner).not.toContain("CAMPAIGN");
  });

  it("T3 current→canonical compatibility mapping", () => {
    expect(resolveCanonicalSupportCategoryId("DELIVERY", "MEMBER")).toBe("ORDER");
    expect(resolveCanonicalSupportCategoryId("REFUND", "MEMBER")).toBe(
      "PAYMENT_RECHARGE"
    );
    expect(resolveCanonicalSupportCategoryId("RECHARGE", "OWNER")).toBe("CASH_COIN");
    expect(resolveCanonicalSupportCategoryId("BANK_ACCOUNT", "OWNER")).toBe("CASH_COIN");
    expect(resolveCanonicalSupportCategoryId("CAMPAIGN", "OWNER")).toBe("DELIVERY_AD");
    expect(MEMBER_SUPPORT_CATEGORIES).toContain("DELIVERY");
    expect(OWNER_SUPPORT_CATEGORIES).toContain("BANK_ACCOUNT");
  });

  it("T4 issue belongs to category", () => {
    expect(isValidSupportIssueForCategory("ORDER", "ORDER_STATUS")).toBe(true);
    expect(isValidSupportIssueForCategory("PAYMENT_RECHARGE", "REFUND_GENERAL")).toBe(
      true
    );
  });

  it("T5 invalid issue blocked", () => {
    expect(isValidSupportIssueForCategory("ORDER", "POINT_CHARGE_HOW_TO")).toBe(false);
    expect(
      validateSupportCategoryForOpen({
        audience: "MEMBER",
        category: "ORDER",
        issueType: "POINT_CHARGE_HOW_TO",
        allowMissingIssue: false,
      }).ok
    ).toBe(false);
  });

  it("T6 explicit OTHER accepted", () => {
    const res = validateSupportCategoryForOpen({
      audience: "MEMBER",
      category: "OTHER",
      issueType: "GENERAL",
      allowMissingIssue: false,
    });
    expect(res).toEqual({
      ok: true,
      audience: "MEMBER",
      category: "OTHER",
      issueType: "GENERAL",
      issueCompatibility: false,
    });
  });

  it("T7 implicit OTHER fallback absent", () => {
    const empty = validateSupportCategoryForOpen({
      audience: "MEMBER",
      category: "   ",
      allowMissingIssue: true,
    });
    expect(empty).toEqual({ ok: false, error: "missing_category" });

    const emptyNorm = normalizeSupportContextForCase({
      ...buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "t",
      }),
      category: "   " as "ORDER",
    });
    expect(emptyNorm.category).toBe("");

    const refSrc = readSrc("lib/support/support-reference-authority.ts");
    expect(refSrc).not.toMatch(/category\.trim\(\)\s*\|\|\s*["']OTHER["']/);
    const svc = readSrc("lib/support/support-case-service.ts");
    expect(svc).not.toMatch(/category\s*\?\?\s*["']OTHER["']/);
    expect(svc).not.toMatch(/category\s*\|\|\s*["']OTHER["']/);
    expect(svc).toContain("assertSupportGenericHubCategoryPolicy");

    // Generic hubs must not hardcode OTHER
    for (const rel of [
      "components/mypage/cs/CustomerCenterHubClient.tsx",
      "components/business/owner/OwnerCustomerCenterView.tsx",
      "components/stores/owner/dashboard/OwnerCustomerCareCard.tsx",
    ]) {
      expect(readSrc(rel)).not.toMatch(/category:\s*["']OTHER["']/);
    }

    expect(
      assertSupportGenericHubCategoryPolicy({
        sourceSurface: "mypage_customer_center",
        canonicalCategory: "OTHER",
      })
    ).toEqual({ ok: false, error: "generic_other_forbidden" });
    expect(
      assertSupportGenericHubCategoryPolicy({
        sourceSurface: "mypage_customer_center",
        canonicalCategory: "OTHER",
        explicitOtherSelection: true,
      })
    ).toEqual({ ok: true });
    expect(
      assertSupportGenericHubCategoryPolicy({
        sourceSurface: "mypage_customer_center",
        canonicalCategory: "ORDER",
      })
    ).toEqual({ ok: true });
  });

  it("T8 historical NULL issue readable (compat path)", () => {
    const res = validateSupportCategoryForOpen({
      audience: "MEMBER",
      category: "ORDER",
      issueType: null,
      allowMissingIssue: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.issueType).toBeNull();
      expect(res.issueCompatibility).toBe(true);
    }
  });

  it("T9 structured open validation", () => {
    expect(
      validateSupportCategoryForOpen({
        audience: "MEMBER",
        category: "ORDER",
        allowMissingIssue: false,
      })
    ).toEqual({ ok: false, error: "missing_issue_type" });

    expect(
      validateSupportCategoryForOpen({
        audience: "MEMBER",
        category: "NOT_A_REAL_CAT",
        issueType: "ORDER_STATUS",
        allowMissingIssue: false,
      }).ok
    ).toBe(false);

    expect(
      validateSupportCategoryForOpen({
        audience: "OWNER",
        category: "PAYMENT_RECHARGE",
        issueType: "POINT_CHARGE_HOW_TO",
        allowMissingIssue: false,
      }).ok
    ).toBe(false);
  });

  it("T10 guidance/category/issue consistency", () => {
    const ok = assertGuidanceOpenConsistency({
      entry: {
        id: "g1",
        audience: "MEMBER",
        category: "ORDER",
        issue_type: "ORDER_STATUS",
        enabled: true,
        revision: 2,
      },
      audience: "MEMBER",
      category: "ORDER",
      issueType: "ORDER_STATUS",
      guidanceKey: "g1",
      guidanceRevision: 2,
    });
    expect(ok).toEqual({ ok: true });

    expect(
      assertGuidanceOpenConsistency({
        entry: {
          id: "g1",
          audience: "MEMBER",
          category: "ORDER",
          issue_type: "ORDER_STATUS",
          enabled: true,
          revision: 2,
        },
        audience: "MEMBER",
        category: "COUPON",
        issueType: "ORDER_STATUS",
        guidanceKey: "g1",
      }).ok
    ).toBe(false);
  });

  it("T11 CTA fail-closed", () => {
    expect(validateSupportGuidanceCta("NONE", null)).toEqual({
      ok: true,
      kind: "NONE",
      target: null,
    });
    expect(validateSupportGuidanceCta("NONE", "/x").ok).toBe(false);
    expect(validateSupportGuidanceCta("INTERNAL_ROUTE", "/mypage/points").ok).toBe(
      true
    );
    expect(validateSupportGuidanceCta("INTERNAL_ROUTE", "https://evil.test").ok).toBe(
      false
    );
    expect(validateSupportGuidanceCta("DOMAIN_ENTITY", "STORE_ORDER:abc-1").ok).toBe(
      true
    );
    expect(validateSupportGuidanceCta("DOMAIN_ENTITY", "https://x").ok).toBe(false);
    expect(validateSupportGuidanceCta("ARBITRARY", "/x").ok).toBe(false);
  });

  it("T12 existing reference authority preserved", () => {
    expect([...SUPPORT_REFERENCE_TYPES]).toEqual([
      "GIFT_INSTANCE",
      "STORE_ORDER",
      "STORE_PRODUCT",
      "AD_CAMPAIGN",
      "DELIVERY_AD_CAMPAIGN",
      "STORE_SETTLEMENT",
    ]);
    const src = readSrc("lib/support/support-reference-authority.ts");
    expect(src).not.toContain("POINT_CHARGE");
    expect(src).not.toContain("FEED_AD_REQUEST");
    expect(src).not.toContain("CASH_CHARGE");
    expect(src).not.toContain("COIN_WITHDRAWAL");
    const allowed = new Set(SUPPORT_REFERENCE_TYPES);
    for (const cat of SUPPORT_CATEGORY_REGISTRY) {
      for (const ref of cat.allowedReferenceTypes) {
        expect(allowed.has(ref as (typeof SUPPORT_REFERENCE_TYPES)[number])).toBe(
          true
        );
      }
    }
  });

  it("T13 first_admin_response_at first public reply only", () => {
    expect(
      shouldStampFirstAdminResponseAt({
        existingFirstAdminResponseAt: null,
        senderType: "ADMIN",
        messageType: "PUBLIC",
      })
    ).toBe(true);
    expect(
      shouldStampFirstAdminResponseAt({
        existingFirstAdminResponseAt: "2026-01-01T00:00:00.000Z",
        senderType: "ADMIN",
        messageType: "PUBLIC",
      })
    ).toBe(false);
    const svc = readSrc("lib/support/support-case-service.ts");
    expect(svc).toContain("shouldStampFirstAdminResponseAt");
  });

  it("T14 internal note does not set first response", () => {
    expect(
      shouldStampFirstAdminResponseAt({
        existingFirstAdminResponseAt: null,
        senderType: "ADMIN",
        messageType: "INTERNAL_NOTE",
      })
    ).toBe(false);
  });

  it("T15 assignment does not set first response", () => {
    const svc = readSrc("lib/support/support-case-service.ts");
    const assignBlock = svc.slice(
      svc.indexOf("export async function adminAssignSupportCase"),
      svc.indexOf("export async function adminAssignSupportCase") + 800
    );
    expect(assignBlock).toContain("assigned_admin_id");
    expect(assignBlock).not.toContain("first_admin_response_at");
  });

  it("T16 queue PRE cases", () => {
    expect(
      isSupportCasePreHandling({
        status: "OPEN",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCasePreHandling({
        status: "WAITING_ADMIN",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      classifySupportCaseOperational({
        status: "OPEN",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe("PRE");
  });

  it("T17 queue IN_PROGRESS cases", () => {
    expect(
      isSupportCaseInProgress({
        status: "OPEN",
        assigned_admin_id: "a1",
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCaseInProgress({
        status: "WAITING_ADMIN",
        assigned_admin_id: "a1",
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCaseInProgress({
        status: "WAITING_ADMIN",
        assigned_admin_id: null,
        first_admin_response_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isSupportCaseInProgress({
        status: "WAITING_USER",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
  });

  it("T18 RESOLVED/ARCHIVED", () => {
    expect(
      isSupportCaseResolved({
        status: "RESOLVED",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      classifySupportCaseOperational({
        status: "ARCHIVED",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe("NONE");
    expect(
      isSupportCaseInAllView({
        status: "OPEN",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCaseInAllView({
        status: "ARCHIVED",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(false);
    // ALL is superset — not mutually exclusive with PRE
    const pre = {
      status: "OPEN",
      assigned_admin_id: null,
      first_admin_response_at: null,
    };
    expect(isSupportCasePreHandling(pre)).toBe(true);
    expect(isSupportCaseInAllView(pre)).toBe(true);
  });

  it("T19 actionable", () => {
    expect(
      isSupportCaseActionable({
        status: "OPEN",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCaseActionable({
        status: "WAITING_ADMIN",
        assigned_admin_id: "a1",
        first_admin_response_at: null,
      })
    ).toBe(true);
    expect(
      isSupportCaseActionable({
        status: "WAITING_USER",
        assigned_admin_id: "a1",
        first_admin_response_at: "t",
      })
    ).toBe(false);
    expect(
      isSupportCaseActionable({
        status: "RESOLVED",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(false);
    expect(
      isSupportCaseActionable({
        status: "ARCHIVED",
        assigned_admin_id: null,
        first_admin_response_at: null,
      })
    ).toBe(false);
  });

  it("T20 existing contextual caller compatibility", () => {
    const callers = [
      "components/mypage/cs/CustomerCenterHubClient.tsx",
      "components/business/owner/OwnerCustomerCenterView.tsx",
      "components/stores/owner/dashboard/OwnerCustomerCareCard.tsx",
      "components/mypage/MyStoreOrderDetailView.tsx",
      "components/support/OwnedGiftInstanceSupportShell.tsx",
      "app/(main)/mypage/points/charge/page.tsx",
      "app/(main)/mypage/coupons/page.tsx",
      "app/(main)/mypage/ads/feed-request/page.tsx",
      "app/(main)/stores/owner/basic-info/page.tsx",
      "app/(main)/stores/owner/ops-status/page.tsx",
      "app/(main)/stores/owner/finance/page.tsx",
      "app/(main)/stores/owner/settlements/page.tsx",
      "app/(main)/stores/owner/coupons/page.tsx",
      "app/(main)/stores/owner/gift-certificates/page.tsx",
      "app/(main)/stores/owner/ads/new/banner/page.tsx",
      "app/(main)/stores/owner/ads/new/store-sponsored/page.tsx",
      "app/(main)/stores/owner/apply/page.tsx",
      "components/support/OwnerDeliveryAdDetailSupportShell.tsx",
      "components/support/OwnerProductEditSupportShell.tsx",
      "components/support/OwnerStoreSupportShell.tsx",
      "components/support/OwnerSupportContextBridge.tsx",
    ];
    for (const rel of callers) {
      expect(readSrc(rel).length).toBeGreaterThan(0);
    }
    const openRoute = readSrc("app/api/support/cases/open/route.ts");
    expect(openRoute).toContain("allowMissingIssue");
    const svc = readSrc("lib/support/support-case-service.ts");
    expect(svc).toContain("allowMissingIssue");
    // Legacy alias transport still accepted
    expect(
      validateSupportCategoryForOpen({
        audience: "OWNER",
        category: "BANK_ACCOUNT",
        allowMissingIssue: true,
      })
    ).toMatchObject({ ok: true, category: "CASH_COIN", issueType: null });
  });
});
