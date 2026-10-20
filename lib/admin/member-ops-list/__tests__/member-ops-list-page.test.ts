import { describe, expect, it } from "vitest";
import {
  memberOpsListRange,
  parseMemberOpsListPage,
  parseMemberOpsListPageIfRequested,
} from "@/lib/admin/member-ops-list/member-ops-list-page";

const sp = (q: string) => new URLSearchParams(q);

describe("parseMemberOpsListPage (R7 limit 20/50/100)", () => {
  it.each([
    ["", 20],
    ["limit=20", 20],
    ["limit=50", 50],
    ["limit=100", 100],
    ["limit=200", 20],
    ["limit=30", 20],
    ["limit=0", 20],
    ["limit=abc", 20],
  ])("%s → limit %i", (q, limit) => {
    expect(parseMemberOpsListPage(sp(q)).limit).toBe(limit);
  });

  it("offset: 음수·문자는 0, 정수는 그대로", () => {
    expect(parseMemberOpsListPage(sp("offset=-5")).offset).toBe(0);
    expect(parseMemberOpsListPage(sp("offset=x")).offset).toBe(0);
    expect(parseMemberOpsListPage(sp("limit=100&offset=200")).offset).toBe(200);
  });

  it("range 는 to 포함", () => {
    expect(memberOpsListRange({ limit: 50, offset: 100 })).toEqual([100, 149]);
  });

  it("IfRequested: limit/offset 이 없으면 null (기존 호출자 호환)", () => {
    expect(parseMemberOpsListPageIfRequested(sp("status=open"))).toBeNull();
    expect(parseMemberOpsListPageIfRequested(sp("limit="))).toBeNull();
    expect(parseMemberOpsListPageIfRequested(sp("offset=0"))).toEqual({ limit: 20, offset: 0 });
    expect(parseMemberOpsListPageIfRequested(sp("limit=50"))).toEqual({ limit: 50, offset: 0 });
  });
});
