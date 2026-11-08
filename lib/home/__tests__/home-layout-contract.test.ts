import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  HOME_MENU_CATALOG,
  HOME_TILES_MAX_VISIBLE,
  normalizeHomeLayout,
  resolveVisibleHomeSections,
  validateHomeLayoutPayload,
} from "@/lib/home/home-layout-contract";

describe("home layout contract (홈 설계안 v11)", () => {
  it("기본 구성 — 서비스 입구 거래·배달·정보교환·채팅·이벤트, 모임 없음", () => {
    const visible = DEFAULT_HOME_LAYOUT.tiles.filter((t) => t.visible).map((t) => t.key);
    expect(visible).toEqual(["trade", "stores", "philife", "chat", "events"]);
    expect(Object.keys(HOME_MENU_CATALOG).some((k) => /meet/i.test(k))).toBe(false);
  });

  it("깨진 저장값은 기본값", () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout("x")).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("저장 순서 유지 · 모르는 키 버림 · 빠진 항목은 기본 순서로 뒤에", () => {
    const c = normalizeHomeLayout({
      sections: [{ key: "panels", visible: true, guestVisible: true }, { key: "bogus" }],
      tiles: [{ key: "events", visible: true }, { key: "meetings", visible: true }],
    });
    expect(c.sections[0]!.key).toBe("panels");
    expect(c.sections.map((s) => s.key)).not.toContain("bogus");
    expect(c.tiles[0]).toEqual({ key: "events", visible: true });
    expect(c.tiles.map((t) => t.key)).not.toContain("meetings");
    expect(c.tiles.length).toBe(DEFAULT_HOME_LAYOUT.tiles.length);
  });

  it("「지금 진행 중」은 비로그인에게 절대 안 보임", () => {
    const c = normalizeHomeLayout({ sections: [{ key: "ongoing", visible: true, guestVisible: true }] });
    expect(c.sections.find((s) => s.key === "ongoing")!.guestVisible).toBe(false);
    expect(resolveVisibleHomeSections(c, true)).not.toContain("ongoing");
    expect(resolveVisibleHomeSections(c, false)).toContain("ongoing");
  });

  it("로그인 안내 칸은 비로그인만", () => {
    expect(resolveVisibleHomeSections(DEFAULT_HOME_LAYOUT, true)).toContain("guestCta");
    expect(resolveVisibleHomeSections(DEFAULT_HOME_LAYOUT, false)).not.toContain("guestCta");
  });

  it("서비스 입구 보이기 개수 제한", () => {
    const tiles = DEFAULT_HOME_LAYOUT.tiles.map((t) => ({ ...t, visible: true }));
    expect(tiles.length).toBeGreaterThan(HOME_TILES_MAX_VISIBLE);
    expect(validateHomeLayoutPayload({ ...DEFAULT_HOME_LAYOUT, tiles })).toEqual({ ok: false, error: "too_many_tiles" });
    expect(validateHomeLayoutPayload(DEFAULT_HOME_LAYOUT).ok).toBe(true);
  });

  it("메뉴 주소는 실제 경로 — 거래 /market · 정보교환 /philife · 전체 /services", () => {
    expect(HOME_MENU_CATALOG.trade.href).toBe("/market");
    expect(HOME_MENU_CATALOG.philife.href).toBe("/philife");
    expect(HOME_MENU_CATALOG.all.href).toBe("/services");
  });
});
