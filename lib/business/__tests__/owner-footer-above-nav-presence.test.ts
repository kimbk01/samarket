import { describe, expect, it } from "vitest";
import {
  getOwnerFooterAboveNavActive,
  pushOwnerFooterAboveNav,
  subscribeOwnerFooterAboveNav,
} from "@/lib/business/owner-bottom-nav-occupancy";

describe("탭 위 저장·취소 바 표시 — 사장님 탭 스크롤 숨김 끄기 신호 (Owner S-A 2026-11-03)", () => {
  it("바가 하나라도 떠 있으면 active, 모두 내려가면 inactive · 해제는 1회만", () => {
    let notified = 0;
    const unsub = subscribeOwnerFooterAboveNav(() => {
      notified += 1;
    });
    expect(getOwnerFooterAboveNavActive()).toBe(false);
    const a = pushOwnerFooterAboveNav();
    const b = pushOwnerFooterAboveNav();
    expect(getOwnerFooterAboveNavActive()).toBe(true);
    a();
    a();
    expect(getOwnerFooterAboveNavActive()).toBe(true);
    b();
    expect(getOwnerFooterAboveNavActive()).toBe(false);
    expect(notified).toBe(4);
    unsub();
  });
});
