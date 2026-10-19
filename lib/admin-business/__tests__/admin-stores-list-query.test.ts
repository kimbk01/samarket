import { describe, expect, it } from "vitest";
import {
  ADMIN_STORES_DEFAULT_PAGE_SIZE,
  ADMIN_STORES_MAX_PAGE_SIZE,
  buildAdminStoresSearchOrFilter,
  buildAdminStoresStatusCounts,
  parseAdminStoresPaging,
  sanitizeAdminStoresSearchTerm,
} from "@/lib/admin-business/admin-stores-list-query";

describe("admin stores list query (DEF-15)", () => {
  it("keeps legacy callers unpaged when page is absent", () => {
    expect(parseAdminStoresPaging(new URLSearchParams("status=approved"))).toBeNull();
  });

  it("parses page / page_size with clamps", () => {
    expect(parseAdminStoresPaging(new URLSearchParams("page=3&page_size=20"))).toEqual({
      page: 3,
      pageSize: 20,
      from: 40,
      to: 59,
    });
    expect(parseAdminStoresPaging(new URLSearchParams("page=0"))?.page).toBe(1);
    expect(parseAdminStoresPaging(new URLSearchParams("page=1"))?.pageSize).toBe(ADMIN_STORES_DEFAULT_PAGE_SIZE);
    expect(parseAdminStoresPaging(new URLSearchParams("page=1&page_size=9999"))?.pageSize).toBe(
      ADMIN_STORES_MAX_PAGE_SIZE
    );
  });

  it("sanitizes PostgREST-breaking characters", () => {
    expect(sanitizeAdminStoresSearchTerm("@abc,(d)%*")).toBe("abc d");
    expect(sanitizeAdminStoresSearchTerm("   ")).toBe("");
  });

  it("builds an or-filter with owner ids and uuid matches", () => {
    expect(buildAdminStoresSearchOrFilter("", [], { includeRequestNote: true })).toBeNull();
    const f = buildAdminStoresSearchOrFilter("pizza", ["11111111-1111-1111-1111-111111111111", "bad"], {
      includeRequestNote: false,
    });
    expect(f).toContain("store_name.ilike.%pizza%");
    expect(f).not.toContain("application_request_note");
    expect(f).toContain("owner_user_id.in.(11111111-1111-1111-1111-111111111111)");
    const u = buildAdminStoresSearchOrFilter("22222222-2222-2222-2222-222222222222", [], {
      includeRequestNote: true,
    });
    expect(u).toContain("id.eq.22222222-2222-2222-2222-222222222222");
    expect(u).toContain("application_request_note.ilike.");
  });

  it("derives all / actionable counts from server totals (no 300 cap)", () => {
    const c = buildAdminStoresStatusCounts({ pending: 400, under_review: 5, approved: 1200 }, 1700);
    expect(c.all).toBe(1700);
    expect(c.actionable).toBe(405);
    expect(c.revision_requested).toBe(0);
  });
});
