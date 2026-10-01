import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_ADMIN_CAPABILITY_CATALOG } from "@/lib/admin-users/member-admin-capability-catalog";
import { MEMBER_ADMIN_SCREEN_CATALOG } from "@/lib/admin-users/member-admin-screen-catalog";
import { MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS } from "@/lib/admin-users/member-admin-copy-ssot";
import { memberDetailCtaCapabilityMapAccountsForCatalog } from "@/lib/admin-users/member-detail-control-center-ia";
import { memberListPrimaryStore, MEMBER_LIST_STORE_NONE_KO } from "@/lib/admin-users/member-list-presentation";
import { MEMBER_DETAIL_STORE_NONE_KO } from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_STORE_ONE_OWNER_UNIQUE_INDEX,
  MEMBER_STORE_OWNER_COLUMN,
  MEMBER_STORE_RELATION_COPY,
  MEMBER_STORE_RELATION_OPERATION_MATRIX,
  memberStoreApprovalStatusLabelKo,
  resolveCanonicalMemberStore,
} from "@/lib/admin-users/member-store-relation-ssot";
import { classifyStoresInsertUniqueViolation } from "@/lib/stores/classify-stores-insert-unique-violation";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("R5 Store Relationship — 1 account = 1 store", () => {
  it("preserves CAP 33 / Screens 28", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG).toHaveLength(33);
    expect(MEMBER_ADMIN_SCREEN_CATALOG).toHaveLength(28);
  });

  it("canonical Store relation authority is stores.owner_user_id + unique index", () => {
    expect(MEMBER_STORE_OWNER_COLUMN).toBe("owner_user_id");
    expect(MEMBER_STORE_ONE_OWNER_UNIQUE_INDEX).toBe("stores_one_owner_one_store_uidx");
    const migration = src("supabase/migrations/20270101120000_stores_one_owner_one_store_unique.sql");
    expect(migration).toContain("stores_one_owner_one_store_uidx");
    expect(migration).toContain("owner_user_id");
    const meStores = src("app/api/me/stores/route.ts");
    expect(meStores).toContain("owner_user_id");
    expect(meStores).toMatch(/already_has_active_application/);
  });

  it("1-account=1-store operation matrix forbids unsafe admin attach/transfer", () => {
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.CREATE_RELATION).toBe("SUPPORTED");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.APPROVE_PENDING_RELATION).toBe("SUPPORTED");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.ATTACH_OWNERLESS_STORE).toBe("FORBIDDEN");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.TRANSFER_STORE_OWNER).toBe("NOT_AUTHORIZED");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.DETACH_RELATION).toBe("NOT_AUTHORIZED");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.REPLACE_MEMBER_STORE).toBe("NOT_AUTHORIZED");
    expect(MEMBER_STORE_RELATION_OPERATION_MATRIX.REMOVE_STORE_OWNERSHIP).toBe("NOT_AUTHORIZED");
  });

  it("DB concurrency maps unique violation to business error", () => {
    const classified = classifyStoresInsertUniqueViolation({
      code: "23505",
      message: "duplicate key value violates unique constraint \"stores_one_owner_one_store_uidx\"",
    });
    expect(classified).toBe("already_has_active_application");
  });

  it("canonical primary store resolver is 1:1", () => {
    expect(resolveCanonicalMemberStore([])).toBeNull();
    expect(
      resolveCanonicalMemberStore([
        { id: "s1", store_name: "A", approval_status: "approved" },
        { id: "s2", store_name: "B", approval_status: "pending" },
      ])?.id,
    ).toBe("s1");
    expect(memberStoreApprovalStatusLabelKo("approved")).toBe("승인됨");
    expect(MEMBER_DETAIL_STORE_NONE_KO).toBe("매장 없음");
    expect(MEMBER_LIST_STORE_NONE_KO).toBe("매장 없음");
  });

  it("Member List uses canonical store relation", () => {
    expect(memberListPrimaryStore({ storeRelation: { count: 0, hasApproved: false, stores: [] } })).toBeNull();
    const cell = memberListPrimaryStore({
      storeRelation: {
        count: 1,
        hasApproved: true,
        stores: [{ id: "store-1", name: "테스트매장", slug: "t", approvalStatus: "approved", isVisible: true, connectedAt: null }],
      },
    });
    expect(cell).toEqual({ id: "store-1", name: "테스트매장" });
    expect(src("lib/admin-users/member-list-presentation.ts")).toContain("resolveCanonicalMemberStore");
  });

  it("Member Detail Store panel is 1:1 + S27 dialog uses MemberAdminDialog", () => {
    const panel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(panel).toContain("resolveCanonicalMemberStore");
    expect(panel).toContain('data-member-detail-store="none"');
    expect(panel).toContain('data-member-detail-store="one"');
    expect(panel).not.toMatch(/\$\{stores\.length\}곳/);
    expect(panel).not.toMatch(/store_staff/);
    const dialog = src("components/admin/users/AdminMemberStoreRelationDialog.tsx");
    expect(dialog).toContain("MemberAdminDialog");
    expect(dialog).toContain('data-member-screen="S27"');
    expect(dialog).toContain("MEMBER_STORE_RELATION_COPY.cannot_attach");
    expect(dialog).toContain("MEMBER_STORE_RELATION_COPY.transfer_forbidden");
    expect(MEMBER_STORE_RELATION_COPY.cannot_attach).toBe("연결할 수 없음");
    expect(MEMBER_STORE_RELATION_COPY.transfer_forbidden).toMatch(/이전/);
    for (const term of ["owner_user_id", "23505", "profiles", "RLS"] as const) {
      expect(dialog.includes(term)).toBe(false);
    }
  });

  it("CAP-STORE-VIEW / CAP-STORE-REL are wired and YES", () => {
    const view = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-STORE-VIEW");
    const rel = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-STORE-REL");
    expect(view?.currentStatus).toBe("YES");
    expect(rel?.currentStatus).toBe("YES");
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/data-member-cta-cap="CAP-STORE-VIEW"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-STORE-REL"/);
    expect(header).toContain("AdminMemberStoreRelationDialog");
    expect(memberDetailCtaCapabilityMapAccountsForCatalog()).toBe(true);
  });

  it("Store detail navigation targets /admin/business/[storeId]", () => {
    const hrefSrc = src("lib/admin-users/member-detail-presentation.ts");
    expect(hrefSrc).toContain("memberBusinessDetailHref");
    const deep = src("lib/admin-users/member-deep-links.ts");
    expect(deep).toContain("resolveAdminStoreApplicationHref");
    const deeplink = src("lib/admin/admin-ops-deeplink.ts");
    expect(deeplink).toMatch(/admin\/business/);
    const links = src("lib/admin-business/business-control-center-links.ts");
    expect(links).toContain("businessCcOwnerMemberHref");
    expect(links).toMatch(/\/admin\/users\//);
  });

  it("no R6 privilege / R7 lifecycle / memberType mutation in R5 surfaces", () => {
    const dialog = src("components/admin/users/AdminMemberStoreRelationDialog.tsx");
    expect(dialog).not.toMatch(/memberType|CAP-PRIV-PROMOTE|CAP-SUSPEND|CAP-PURGE/);
    const panel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(panel).not.toMatch(/memberType|CAP-PRIV-PROMOTE|danger_suspend/);
    expect(MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS).toContain("owner_user_id");
  });

  it("admin store PATCH does not mutate owner_user_id", () => {
    const route = src("app/api/admin/stores/[id]/route.ts");
    // May read owner for audit/context; must not write ownership transfer fields.
    expect(route).not.toMatch(/\.update\([^)]*owner_user_id\s*:/);
    expect(route).not.toMatch(/owner_user_id\s*:\s*body/);
    expect(route).toMatch(/approve_store|approval_status/);
    const commands = src("lib/admin-business/admin-store-patch-commands.ts");
    expect(commands).not.toMatch(/transfer_owner|change_owner|assign_owner|attach_owner/);
  });
});
