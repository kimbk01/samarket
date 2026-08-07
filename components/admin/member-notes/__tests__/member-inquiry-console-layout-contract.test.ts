import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("member inquiry console layout contract", () => {
  const pageSrc = readFileSync(
    join(ROOT, "components/admin/member-notes/AdminMemberNotesPage.tsx"),
    "utf8"
  );

  it("uses console chrome only for kind=inquiry", () => {
    expect(pageSrc).toContain('kind === "inquiry"');
    expect(pageSrc).toContain('data-admin-member-notes-console="inquiry"');
    expect(pageSrc).toContain("AdminConsoleSplitView");
    expect(pageSrc).toContain("AdminConsoleListPane");
    expect(pageSrc).toContain("AdminConsoleDetailPane");
  });

  it("preserves legacy inbox/default surface markers", () => {
    expect(pageSrc).toContain('data-admin-member-notes-console="legacy"');
    expect(pageSrc).toContain("max-w-5xl");
    expect(pageSrc).toContain("showCreate");
    expect(pageSrc).toContain('kind !== "inquiry"');
    expect(pageSrc).toContain("admin_member_notes_inbox_create_title");
  });

  it("keeps existing list/detail/reply authorities (no new endpoints)", () => {
    expect(pageSrc).toContain("/api/admin/member-notes");
    expect(pageSrc).toContain("method: \"POST\"");
    expect(pageSrc).not.toContain("/api/admin/customer-platform/");
    expect(pageSrc).not.toContain("createAdminNoteThread");
  });
});

describe("admin console presentation-only contract", () => {
  const files = [
    "AdminConsoleSplitView.tsx",
    "AdminConsoleListPane.tsx",
    "AdminConsoleDetailPane.tsx",
    "AdminConsoleToolbar.tsx",
    "AdminConsoleState.tsx",
  ];

  it("console chrome does not embed domain fetch/writers", () => {
    for (const name of files) {
      const src = readFileSync(join(ROOT, "components/admin/console", name), "utf8");
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/\/api\/admin/);
      expect(src).not.toMatch(/postNoteMessage|listAdminNoteThreads|markAdminNoteThreadRead/);
    }
  });
});
