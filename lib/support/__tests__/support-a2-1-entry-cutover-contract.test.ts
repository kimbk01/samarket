import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * A2-1 ENTRY CUTOVER — Member/Owner new CS writers → support_cases only.
 * Does not prove Production DB delta (runtime QA separate).
 */
describe("A2-1 support entry cutover contract", () => {
  it("disables POST writers for member-admin-notes and platform-inquiries", () => {
    const notes = read("app/api/me/admin-notes/route.ts");
    const noteThread = read("app/api/me/admin-notes/[threadId]/route.ts");
    const platform = read("app/api/me/stores/[storeId]/platform-inquiries/route.ts");
    expect(notes).toContain("legacy_writer_disabled");
    expect(notes).toContain("status: 410");
    expect(noteThread).toContain("legacy_writer_disabled");
    expect(platform).toContain("legacy_writer_disabled");
  });

  it("Member customer center inquire CTA opens Support Modal SSOT", () => {
    const hub = read("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(hub).toContain("navigateToSupportCenter");
    expect(hub).toContain("data-support-entry-ssot");
    expect(hub).toContain("data-support-hub-inquire");
    expect(hub).not.toMatch(/href=\{[^}]*\/mypage\/inquiries[^}]*\}.*문의하기/);
  });

  it("Member legacy note list has no compose POST", () => {
    const list = read("components/mypage/cs/MemberCsNoteListClient.tsx");
    expect(list).not.toContain('method: "POST"');
    expect(list).not.toContain("allowCreate");
    expect(list).toContain("support_legacy_archive_title");
  });

  it("Owner customer center inquire CTA opens Support Modal with store context", () => {
    const view = read("components/business/owner/OwnerCustomerCenterView.tsx");
    expect(view).toContain("navigateToSupportCenter");
    expect(view).toContain("buildOwnerSupportContext");
    expect(view).toContain("data-owner-support-inquire");
    expect(view).toContain("SupportCasesHistoryList");
  });

  it("Owner care card customer-center cell opens Support Modal", () => {
    const card = read("components/stores/owner/dashboard/OwnerCustomerCareCard.tsx");
    expect(card).toContain("navigateToSupportCenter");
    expect(card).toContain('data-owner-home-care-entry="customer-center"');
    expect(card).toContain("buildOwnerSupportContext");
  });

  it("Support Modal host does not dual-write legacy note/platform tables", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).not.toContain("/api/me/admin-notes");
    expect(host).not.toContain("platform-inquiries");
    expect(host).toMatch(/\/api\/support\/cases/);
  });

  it("exposes requester support history API", () => {
    const route = read("app/api/support/cases/route.ts");
    expect(route).toContain("listSupportCasesForRequester");
  });
});
