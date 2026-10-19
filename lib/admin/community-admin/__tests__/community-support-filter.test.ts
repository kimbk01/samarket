import { describe, expect, it, vi } from "vitest";
import {
  isSupportCaseAppeal,
  isSupportCaseInCommunityScope,
  parseSupportCaseKind,
  parseSupportCaseScope,
  supportAppealOrFilter,
  supportCommunityScopeOrFilter,
  SUPPORT_COMMUNITY_REFERENCE_TYPES,
} from "@/lib/support/support-community-filter";
import {
  SUPPORT_REFERENCE_TYPES,
  assertSupportReferenceAuthority,
} from "@/lib/support/support-reference-authority";
import { resolveSupportReferenceAdminHref } from "@/lib/support/support-reference-admin-href";
import { SUPPORT_CATEGORY_REGISTRY } from "@/lib/support/support-category-registry";
import { getSupportCategoryGroup } from "@/lib/support/support-category-groups";

const ID = "de06f845-c12a-43a1-8b34-e7ec75afa388";
const ME = "user-me";

function sbReturning(row: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return { from: vi.fn(() => chain) } as never;
}

describe("support community filter (C-23 · F-4)", () => {
  it("params: ?group=community and ?type=appeal; absent → null (existing behaviour)", () => {
    expect(parseSupportCaseScope("community")).toBe("community");
    expect(parseSupportCaseScope("COMMUNITY")).toBe("community");
    expect(parseSupportCaseScope("FINANCE")).toBeNull();
    expect(parseSupportCaseScope(null)).toBeNull();
    expect(parseSupportCaseKind("appeal")).toBe("appeal");
    expect(parseSupportCaseKind("")).toBeNull();
    // community is not a category group → existing group filter stays untouched
    expect(getSupportCategoryGroup("community")).toBeNull();
  });

  it("community scope = COMMUNITY_* + charge/promotion refs + REPORT category", () => {
    expect(supportCommunityScopeOrFilter()).toBe(
      "reference_type.in.(COMMUNITY_POST,COMMUNITY_COMMENT,COMMUNITY_REPORT,COMMUNITY_SANCTION,POINT_CHARGE_REQUEST,POINT_PROMOTION_ORDER),category.in.(REPORT)"
    );
    expect(isSupportCaseInCommunityScope({ category: "REPORT", reference_type: null })).toBe(true);
    expect(isSupportCaseInCommunityScope({ category: "OTHER", reference_type: "COMMUNITY_POST" })).toBe(true);
    expect(isSupportCaseInCommunityScope({ category: "PAYMENT_RECHARGE", reference_type: "POINT_CHARGE_REQUEST" })).toBe(true);
    expect(isSupportCaseInCommunityScope({ category: "ORDER", reference_type: "STORE_ORDER" })).toBe(false);
  });

  it("appeal = sanction refs, or post/comment refs outside the REPORT category", () => {
    expect(supportAppealOrFilter()).toBe(
      "reference_type.in.(COMMUNITY_SANCTION),and(reference_type.in.(COMMUNITY_POST,COMMUNITY_COMMENT),category.neq.REPORT)"
    );
    expect(isSupportCaseAppeal({ category: "ACCOUNT", reference_type: "COMMUNITY_SANCTION" })).toBe(true);
    expect(isSupportCaseAppeal({ category: "OTHER", reference_type: "COMMUNITY_POST" })).toBe(true);
    expect(isSupportCaseAppeal({ category: "REPORT", reference_type: "COMMUNITY_POST" })).toBe(false);
    expect(isSupportCaseAppeal({ category: "REPORT", reference_type: null })).toBe(false);
  });

  it("new reference types are in the inventory and allowed only on REPORT/ACCOUNT/OTHER", () => {
    for (const t of SUPPORT_COMMUNITY_REFERENCE_TYPES) expect(SUPPORT_REFERENCE_TYPES).toContain(t);
    const owners = SUPPORT_CATEGORY_REGISTRY.filter((c) =>
      c.allowedReferenceTypes.some((r) => (SUPPORT_COMMUNITY_REFERENCE_TYPES as readonly string[]).includes(r))
    ).map((c) => c.id);
    expect(owners.sort()).toEqual(["ACCOUNT", "OTHER", "REPORT"]);
    expect(SUPPORT_CATEGORY_REGISTRY.find((c) => c.id === "ACCOUNT")?.allowedReferenceTypes).toEqual(["COMMUNITY_SANCTION"]);
  });

  it("admin hrefs point to the community workspace", () => {
    expect(resolveSupportReferenceAdminHref("COMMUNITY_POST", ID)?.href).toBe(`/admin/community/posts/${ID}`);
    expect(resolveSupportReferenceAdminHref("COMMUNITY_COMMENT", ID)?.href).toBe(`/admin/community/comments?commentId=${ID}`);
    expect(resolveSupportReferenceAdminHref("COMMUNITY_REPORT", ID)?.href).toBe(`/admin/community/reports?reportId=${ID}`);
    expect(resolveSupportReferenceAdminHref("COMMUNITY_SANCTION", ID)?.href).toBe(
      `/admin/community/restrictions?sanctionId=${ID}`
    );
    expect(resolveSupportReferenceAdminHref("COMMUNITY_SANCTION", ID)?.mutationOwner).toBe("COMMUNITY");
  });

  it("authority: own or public post, own report, own community sanction; owners denied", async () => {
    const ok = (row: Record<string, unknown> | null, referenceType: string) =>
      assertSupportReferenceAuthority(sbReturning(row), { userId: ME, audience: "MEMBER", referenceType, referenceId: ID });
    await expect(ok({ id: ID, user_id: "other", status: "active" }, "COMMUNITY_POST")).resolves.toEqual({ ok: true });
    await expect(ok({ id: ID, user_id: ME, status: "hidden" }, "COMMUNITY_POST")).resolves.toEqual({ ok: true });
    await expect(ok({ id: ID, user_id: "other", status: "hidden" }, "COMMUNITY_COMMENT")).resolves.toEqual({
      ok: false,
      error: "reference_forbidden",
    });
    await expect(ok({ id: ID, user_id: ME }, "COMMUNITY_REPORT")).resolves.toEqual({ ok: true });
    await expect(ok({ id: ID, user_id: "other" }, "COMMUNITY_REPORT")).resolves.toMatchObject({ ok: false });
    await expect(ok({ id: ID, user_id: ME, scope: "community" }, "COMMUNITY_SANCTION")).resolves.toEqual({ ok: true });
    await expect(ok(null, "COMMUNITY_SANCTION")).resolves.toMatchObject({ ok: false });
    await expect(
      assertSupportReferenceAuthority(sbReturning({ id: ID, user_id: ME, status: "active" }), {
        userId: ME,
        audience: "OWNER",
        storeId: ID,
        referenceType: "COMMUNITY_POST",
        referenceId: ID,
      })
    ).resolves.toMatchObject({ ok: false });
  });
});
