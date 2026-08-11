import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin member overview Slice 4", () => {
  it("uses ledger sum and does not treat profiles.points as overview SSOT", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/admin-users/member-overview-aggregates.ts"),
      "utf8",
    );
    expect(src).toMatch(/sumUserPointLedger/);
    expect(src).not.toMatch(/readUserPointBalance/);
    expect(src).toMatch(/select\("id, chat_domain, last_message_at"\)/);
    expect(src).not.toMatch(/last_message,/);
    expect(src).not.toMatch(/store_staff/);
  });

  it("overview route is users-gated and omits points without point permission", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/users/[id]/overview/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/requireAdminPermission\("users"\)/);
    expect(src).toMatch(/permissionKeyAllowed\(gate\.actor\.permissions, "point"\)/);
    expect(src).toMatch(/includePoints/);
  });

  it("overview UI does not render failed metrics as 0", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/users/AdminMemberOverviewPanel.tsx"),
      "utf8",
    );
    expect(src).toMatch(/admin_users_cc_metric_error/);
    expect(src).not.toMatch(/metric\.value \?\? 0/);
  });
});
