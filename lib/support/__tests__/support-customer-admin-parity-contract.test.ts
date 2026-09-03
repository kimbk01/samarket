import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Support Customer ↔ Admin message parity contracts", () => {
  it("both UIs render support_messages sender_type / message_type without a second chat model", () => {
    const customer = read("components/support/SupportModalHost.tsx");
    const admin = read("components/admin/support/AdminSupportPage.tsx");
    expect(customer).toContain("SupportMessageRow");
    expect(customer).toContain("sender_type");
    expect(customer).toContain("/api/support/cases/");
    expect(admin).toContain("SupportMessageRow");
    expect(admin).toContain("sender_type");
    expect(admin).toContain("message_type");
    expect(admin).toContain("INTERNAL_NOTE");
    expect(admin).toContain("/api/admin/support/cases/");
    expect(admin).not.toContain("admin_chat_messages");
    expect(customer).not.toContain("admin_chat_messages");
  });

  it("customer filters to public semantics; admin can show internal notes", () => {
    const service = read("lib/support/support-case-service.ts");
    expect(service).toContain('message_type", "PUBLIC"');
    expect(service).toContain("INTERNAL_NOTE");
    const admin = read("components/admin/support/AdminSupportPage.tsx");
    expect(admin).toContain("관리자 내부 메모");
    expect(admin).toContain("internalNote: true");
  });

  it("customer shell consumes shared usable-area; admin is 3-column console", () => {
    expect(read("components/support/SupportSheetShell.tsx")).toContain("DibayUsableAreaSheet");
    const admin = read("components/admin/support/AdminSupportPage.tsx");
    expect(admin).toContain('data-admin-support-console="3col"');
    expect(admin).toContain("initial_summary");
  });
});
