/**
 * 고객 문의 남은 위험 ⑤ — 고객지원 권한이 빠지면 담당 문의를 미배정으로 (동작).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { allows: true, released: [] as string[] };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  resolveAdminRecipientAuthority: vi.fn(async () => ({ active: true, isSuperAdmin: false, permissions: [] })),
  authorityAllows: vi.fn(() => state.allows),
}));
vi.mock("@/lib/admin/admin-membership", () => ({
  releaseSupportAssignmentsOnRevoke: vi.fn(async (_sb: unknown, input: { userId: string }) => {
    state.released.push(input.userId);
    return { released: 1 };
  }),
}));

import { releaseSupportAssignmentsIfNoSupportPermission } from "@/lib/support/support-assignee-permission-sync";
import { readFileSync } from "node:fs";
import { join } from "node:path";

beforeEach(() => {
  state.allows = true;
  state.released.length = 0;
});

describe("support assignee permission sync", () => {
  it("still has support → assignments kept", async () => {
    await releaseSupportAssignmentsIfNoSupportPermission({} as never, { userId: "a", changedBy: "x" });
    expect(state.released).toEqual([]);
  });

  it("support removed → assignments released", async () => {
    state.allows = false;
    await releaseSupportAssignmentsIfNoSupportPermission({} as never, { userId: "a", changedBy: "x" });
    expect(state.released).toEqual(["a"]);
  });

  it("(구조 확인) every permission write path calls the sync", () => {
    const files = [
      "app/api/admin/staff/route.ts",
      "app/api/admin/staff/[id]/route.ts",
      "lib/admin-users/member-admin-privilege-mutation.ts",
    ];
    let calls = 0;
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const writes = (src.match(/await replaceStaffPermissions\(/g) ?? []).length;
      const syncs = (src.match(/await releaseSupportAssignmentsIfNoSupportPermission\(/g) ?? []).length;
      expect(syncs).toBe(writes);
      calls += syncs;
    }
    expect(calls).toBe(4);
  });
});
