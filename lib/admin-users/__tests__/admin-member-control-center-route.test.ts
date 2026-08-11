import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin member Control Center route Slice 3", () => {
  it("canonical /admin/users/[id] renders the detail page instead of modal redirect", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/users/[id]/page.tsx"), "utf8");
    expect(src).toMatch(/AdminUserDetailPage/);
    expect(src).not.toMatch(/redirect\(`\/admin\/users\?detail=/);
  });

  it("preserves ?detail= as redirect to the canonical route", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/users/page.tsx"), "utf8");
    expect(src).toMatch(/redirect\(`\/admin\/users\/\$\{encodeURIComponent\(detail\)\}`\)/);
  });

  it("list opens the Control Center route and does not mount the detail modal", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/users/AdminUserListPage.tsx"), "utf8");
    expect(src).toMatch(/router\.push\(`\/admin\/users\/\$\{encodeURIComponent\(id\)\}`\)/);
    expect(src).not.toMatch(/AdminUserDetailModal/);
    expect(src).not.toMatch(/params\.set\("detail"/);
  });

  it("Control Center lazy-mounts tabs and does not invent store staff", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/users/AdminMemberControlCenter.tsx"),
      "utf8",
    );
    expect(src).toMatch(/lazy\.has\("overview"\)/);
    expect(src).toMatch(/AdminUserPointsSection/);
    expect(src).toMatch(/AdminMemberCommunityPanel/);
    expect(src).toMatch(/AdminMemberTradePanel/);
    expect(src).toMatch(/AdminMemberDeliveryPanel/);
    expect(src).toMatch(/AdminMemberStorePanel/);
    expect(src).toMatch(/AdminMemberChatPanel/);
    expect(src).toMatch(/AdminMemberOpsPanel/);
    expect(src).not.toMatch(/store_staff/);
  });
});
