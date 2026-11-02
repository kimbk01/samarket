import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteMypageScrollVisit, readMypageScroll, saveMypageScroll, mypageScrollKey } from "@/lib/mypage/mypage-scroll-memory";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("내정보 스크롤 규칙 — 들어가면 맨 위 · 돌아오면 그 위치 (2026-11-02)", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("홈 → 분류 → 항목 → 뒤로 → 뒤로 = 새·새·새·돌아옴·돌아옴", () => {
    expect(noteMypageScrollVisit("/mypage")).toBe("new");
    expect(noteMypageScrollVisit("/mypage/section/settings")).toBe("new");
    expect(noteMypageScrollVisit("/mypage/section/settings/leave")).toBe("new");
    expect(noteMypageScrollVisit("/mypage/section/settings")).toBe("return");
    expect(noteMypageScrollVisit("/mypage")).toBe("return");
    // 같은 분류를 다시 열면 새 진입(맨 위)
    expect(noteMypageScrollVisit("/mypage/section/settings")).toBe("new");
  });

  it("다른 도메인에 다녀와 같은 화면 = 돌아옴", () => {
    noteMypageScrollVisit("/mypage");
    noteMypageScrollVisit("/mypage/products");
    expect(noteMypageScrollVisit("/mypage/products")).toBe("return");
  });

  it("위치 저장·읽기 (경로별)", () => {
    const k = mypageScrollKey("/mypage/section/settings", "");
    saveMypageScroll(k, 220.4);
    expect(readMypageScroll(k)).toBe(220);
    expect(readMypageScroll(mypageScrollKey("/mypage", ""))).toBeNull();
  });
});
