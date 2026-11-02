import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appScrollKey,
  isAppScrollMemoryPath,
  markAppScrollNavIntent,
  noteAppScrollVisit,
  readAppScroll,
  resetAppScrollMemoryForTests,
  saveAppScroll,
} from "@/lib/navigation/app-scroll-memory";

function installSessionStorageStub() {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
}

describe("앱 스크롤 규칙 1개 (스크롤 SSOT 2026-11-03)", () => {
  beforeEach(() => {
    installSessionStorageStub();
    resetAppScrollMemoryForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("키 = 경로 + 정렬된 검색 조건", () => {
    expect(appScrollKey("/market/", "b=2&a=1")).toBe("/market?a=1&b=2");
    expect(appScrollKey("/mypage", "")).toBe("/mypage");
  });

  it("새 화면 = new(맨 위) · 기기/브라우저 뒤로(기록 길이 그대로) = return(복원)", () => {
    expect(noteAppScrollVisit("/mypage/section/settings", 3)).toBe("new");
    expect(noteAppScrollVisit("/mypage/section/settings/leave", 4)).toBe("new");
    expect(noteAppScrollVisit("/mypage/section/settings", 4)).toBe("return");
  });

  it("바로 전 화면으로 링크 push(기록 길이 증가) = new — 뒤로로 오판하지 않음 (M-2)", () => {
    noteAppScrollVisit("/mypage", 2);
    noteAppScrollVisit("/mypage/section/trade", 3);
    expect(noteAppScrollVisit("/mypage", 4)).toBe("new");
  });

  it("헤더 ‹ 가 목적지로 push 해도 뒤로 신호가 있으면 return", () => {
    noteAppScrollVisit("/market?lgu=pasig", 2);
    noteAppScrollVisit("/post/p1", 3);
    markAppScrollNavIntent("back");
    expect(noteAppScrollVisit("/market?lgu=pasig", 4)).toBe("return");
  });

  it("하단 탭 전환 = return(그 탭 마지막 위치) · 현재 탭 다시 누르기 = top", () => {
    noteAppScrollVisit("/philife", 2);
    markAppScrollNavIntent("tab-switch");
    expect(noteAppScrollVisit("/market", 2)).toBe("return");
    markAppScrollNavIntent("tab-switch");
    expect(noteAppScrollVisit("/philife", 2)).toBe("return");
    noteAppScrollVisit("/mypage/section/account", 3);
    markAppScrollNavIntent("tab-reselect");
    expect(noteAppScrollVisit("/mypage", 3)).toBe("top");
  });

  it("같은 화면에서 검색 조건만 바뀜(replace) = inplace — 스크롤을 건드리지 않음", () => {
    noteAppScrollVisit("/mypage/store-orders", 2);
    expect(noteAppScrollVisit("/mypage/store-orders?tab=done", 2)).toBe("inplace");
    expect(noteAppScrollVisit("/market?q=a", 3)).toBe("new");
  });

  it("오래된 뒤로 신호는 무시(2.5초)", () => {
    noteAppScrollVisit("/a", 2);
    noteAppScrollVisit("/b", 3);
    markAppScrollNavIntent("back");
    expect(noteAppScrollVisit("/a", 4, Date.now() + 10_000)).toBe("new");
  });

  it("위치 저장 = 보던 항목 + 간격 + 좌표, 30분 지나면 버림", () => {
    const t0 = 1_000_000;
    saveAppScroll("/market", { y: 640, anchor: "h:/post/p1", offset: 12 }, t0);
    expect(readAppScroll("/market", t0 + 60_000)).toEqual({ y: 640, anchor: "h:/post/p1", offset: 12, at: t0 });
    expect(readAppScroll("/market", t0 + 31 * 60_000)).toBeNull();
  });

  it("자체 복원 계약 화면·배달 browse↔매장 슬라이드 경로는 제외", () => {
    expect(isAppScrollMemoryPath("/mypage")).toBe(true);
    expect(isAppScrollMemoryPath("/stores")).toBe(true);
    expect(isAppScrollMemoryPath("/community-messenger")).toBe(true);
    expect(isAppScrollMemoryPath("/community-messenger/rooms/r1")).toBe(false);
    expect(isAppScrollMemoryPath("/notifications")).toBe(false);
    expect(isAppScrollMemoryPath("/stores/browse/restaurant")).toBe(false);
    expect(isAppScrollMemoryPath("/stores/my-slug")).toBe(false);
    expect(isAppScrollMemoryPath("/stores/owner/orders")).toBe(false);
  });
});
