import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  HOME_BANNER_IMAGE_PX,
  HOME_BANNER_SIZE_PERCENT,
  HOME_MENU_CATALOG,
  HOME_SECTION_KEYS,
  HOME_STORE_PICKS_MAX,
  cloneHomeLayout,
  isSafeHomeHref,
  isSafeHomeImageUrl,
  normalizeHomeLayout,
  pickHomeText,
  resolveAudienceBanners,
  resolveVisibleHomeSections,
  validateHomeLayoutPayload,
} from "@/lib/home/home-layout-contract";
import { homeHubMessages } from "@/lib/i18n/catalog/home-hub";

describe("home layout contract (홈 시안 v22)", () => {
  it("기본 칸 순서 — 배너 → 진행 중 → 서비스 카드 → 배달 업종 → 매장 → 거래 → 교민 이야기, 바로가기 끔", () => {
    expect(DEFAULT_HOME_LAYOUT.sections.map((s) => s.key)).toEqual([...HOME_SECTION_KEYS]);
    expect(DEFAULT_HOME_LAYOUT.sections.find((s) => s.key === "shortcuts")!.visible).toBe(false);
    expect(HOME_SECTION_KEYS as readonly string[]).not.toContain("lifeInfo");
  });

  it("서비스 카드 — 큰 카드 거래·배달, 작은 카드 정보교환·채팅·이벤트, 모임 없음", () => {
    const v = DEFAULT_HOME_LAYOUT.services.filter((s) => s.visible);
    expect(v.filter((s) => s.size === "large").map((s) => s.key)).toEqual(["trade", "stores"]);
    expect(v.filter((s) => s.size === "small").map((s) => s.key)).toEqual(["philife", "chat", "events"]);
    expect(Object.keys(HOME_MENU_CATALOG).some((k) => /meet/i.test(k))).toBe(false);
  });

  it("기본 배너 3개(메신저·거래·배달) — 문구는 카탈로그(한/영) · 1:1 · 보통 크기", () => {
    const b = DEFAULT_HOME_LAYOUT.banners;
    expect(b.map((x) => x.id)).toEqual(["dibay-messenger", "dibay-trade", "dibay-delivery"]);
    expect(b.map((x) => x.href)).toEqual(["/community-messenger?section=chats", "/market", "/stores"]);
    expect(b[0]!.title.ko).toBe(homeHubMessages.ko.home_banner_messenger_title);
    expect(b[0]!.title.en).toBe(homeHubMessages.en.home_banner_messenger_title);
    expect(b.every((x) => x.ratio === "1:1" && x.size === "m")).toBe(true);
    expect(b.map((x) => x.side)).toEqual(["left", "right", "left"]);
  });

  it("깨진 저장값·예전 판(schemaVersion 1)은 기본값", () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout({ schemaVersion: 1, sections: [] })).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("저장 순서 유지 · 모르는 칸 버림 · 빠진 칸은 기본 순서로 뒤에", () => {
    const c = normalizeHomeLayout({
      schemaVersion: 2,
      sections: [{ key: "posts", visible: true, guestVisible: true }, { key: "lifeInfo" }],
    });
    expect(c.sections[0]!.key).toBe("posts");
    expect(c.sections.map((s) => s.key)).not.toContain("lifeInfo");
    expect(c.sections.length).toBe(HOME_SECTION_KEYS.length);
  });

  it("진행 중 배달은 비로그인에게 절대 안 보임", () => {
    const c = normalizeHomeLayout({
      schemaVersion: 2,
      sections: [{ key: "ongoing", visible: true, guestVisible: true }],
    });
    expect(c.sections.find((s) => s.key === "ongoing")!.guestVisible).toBe(false);
    expect(resolveVisibleHomeSections(c, true)).not.toContain("ongoing");
    expect(resolveVisibleHomeSections(c, false)).toContain("ongoing");
  });

  it("배너 대상 — 전체/회원만/비로그인만, 끈 배너 제외", () => {
    const c = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    c.banners[0]!.audience = "member";
    c.banners[1]!.audience = "guest";
    c.banners[2]!.visible = false;
    expect(resolveAudienceBanners(c, true).map((b) => b.id)).toEqual(["dibay-trade"]);
    expect(resolveAudienceBanners(c, false).map((b) => b.id)).toEqual(["dibay-messenger"]);
  });

  it("배너 값 범위 — 비율·크기, 바깥 주소 링크·이상한 이미지 주소 거절", () => {
    expect(Object.keys(HOME_BANNER_IMAGE_PX)).toEqual(["1:1", "4:3", "3:4", "16:9"]);
    expect(HOME_BANNER_IMAGE_PX["1:1"]).toEqual({ w: 720, h: 720, minW: 480, minH: 480 });
    expect(HOME_BANNER_SIZE_PERCENT.m).toBe(30);
    expect(isSafeHomeHref("/philife")).toBe(true);
    expect(isSafeHomeHref("https://evil.example")).toBe(false);
    expect(isSafeHomeHref("//evil.example")).toBe(false);
    expect(isSafeHomeImageUrl("/images/home-banners/a.png")).toBe(true);
    expect(isSafeHomeImageUrl("/images/../x")).toBe(false);
    expect(isSafeHomeImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("저장 검증 — 제목 없는 배너·바깥 링크·후보 매장 21곳·예전 판 거절, 기본값 통과", () => {
    expect(validateHomeLayoutPayload(DEFAULT_HOME_LAYOUT).ok).toBe(true);
    const noTitle = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    noTitle.banners[0]!.title = { ko: "", en: "x" };
    expect(validateHomeLayoutPayload(noTitle)).toEqual({ ok: false, error: "banner_title_required" });
    const ext = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    ext.banners[0]!.href = "https://evil.example";
    expect(validateHomeLayoutPayload(ext)).toEqual({ ok: false, error: "invalid_banner_href" });
    const many = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    many.stores.picks = Array.from({ length: HOME_STORE_PICKS_MAX + 1 }, (_, i) => ({
      storeId: `s${i}`,
      menuMode: "auto" as const,
      productIds: [],
      adLabel: false,
    }));
    expect(validateHomeLayoutPayload(many)).toEqual({ ok: false, error: "too_many_store_picks" });
    expect(validateHomeLayoutPayload({ ...DEFAULT_HOME_LAYOUT, schemaVersion: 1 })).toEqual({
      ok: false,
      error: "invalid_schema_version",
    });
  });

  it("매장 칸 값 범위 — 보일 매장 2~5 · 메뉴 3~6 로 자름", () => {
    const c = normalizeHomeLayout({ schemaVersion: 2, stores: { showCount: 99, menusPerStore: 1 } });
    expect(c.stores.showCount).toBe(5);
    expect(c.stores.menusPerStore).toBe(3);
  });

  it("문구 고르기 — 영어가 비면 한국어", () => {
    expect(pickHomeText({ ko: "가", en: "" }, "en")).toBe("가");
    expect(pickHomeText({ ko: "가", en: "A" }, "en")).toBe("A");
    expect(pickHomeText({ ko: "가", en: "A" }, "ko")).toBe("가");
  });

  it("메뉴 주소는 실제 경로 — 거래 /market · 정보교환 /philife · 배달 /stores", () => {
    expect(HOME_MENU_CATALOG.trade.href).toBe("/market");
    expect(HOME_MENU_CATALOG.philife.href).toBe("/philife");
    expect(HOME_MENU_CATALOG.stores.href).toBe("/stores");
  });
});
