/**
 * R7 목록 계약 — 관리자 알림함 서버 페이지 (`/api/admin/inbox?offset=&limit=` → listAdminNotificationsPage).
 * 예전 30건 「더 보기」 커서 대신 limit(20/50/100)/offset + total(count exact).
 * 권한 필터(authorityAllows)는 DB 조건 — total 이 실제 표시 건수와 같다.
 */
import { describe, expect, it } from "vitest";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";
import { listAdminNotificationsPage } from "@/lib/admin/notifications/admin-notification-service";

function setup(total: number, unread: number) {
  return createFakePagedSb((call) => {
    const head = fakeOps(call, "select").some((a) => (a[1] as { head?: boolean } | undefined)?.head);
    if (head) return { data: null, count: unread };
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    const rows = [];
    for (let i = from; i <= Math.min(to, total - 1); i += 1) {
      rows.push({ id: `n${i}`, kind: "support_customer_replied", title: `t${i}`, created_at: "2026-10-01T00:00:00Z" });
    }
    return { data: rows, count: total };
  });
}

describe("listAdminNotificationsPage", () => {
  it("offset=40·limit=20 → 41~45번째 5건 + total 45 + unread count", async () => {
    const fake = setup(45, 7);
    const r = await listAdminNotificationsPage(fake.sb as never, {
      adminUserId: "a1",
      authority: { active: true, isSuperAdmin: true, permissions: [] },
      limit: 20,
      offset: 40,
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.total).toBe(45);
    expect(r.items).toHaveLength(5);
    expect(r.unread).toBe(7);
    const list = fake.calls[0];
    expect(fakeCountExact(list)).toBe(true);
    expect(fakeOps(list, "range")[0]).toEqual([40, 59]);
    expect(fakeOps(list, "limit")).toHaveLength(0);
    // super_admin 은 권한 조건 없음
    expect(fakeOps(list, "or")).toHaveLength(0);
  });

  it("일반 관리자는 권한 조건을 DB 에 건다 (users → users_edit_membership 포함)", async () => {
    const fake = setup(3, 0);
    await listAdminNotificationsPage(fake.sb as never, {
      adminUserId: "a2",
      authority: { active: true, isSuperAdmin: false, permissions: ["users", "point"] as never },
      limit: 20,
      offset: 0,
      unreadOnly: true,
    });
    const list = fake.calls[0];
    const or = String(fakeOps(list, "or")[0]?.[0] ?? "");
    expect(or).toContain("required_permission.is.null");
    expect(or).toContain("users_edit_membership");
    expect(or).toContain("point");
    expect(fakeOps(list, "is")).toContainEqual(["read_at", null]);
  });
});
