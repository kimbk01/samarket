import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  HOME_BANNER_BODY_MAX,
  HOME_BANNER_CHIP_MAX,
  HOME_BANNER_CTA_MAX,
  HOME_BANNER_HERO_RATIO,
  HOME_BANNER_IMAGE_PX,
  HOME_BANNER_SIZE_PERCENT,
  HOME_BANNER_TITLE_MAX,
  HOME_MENU_CATALOG,
  HOME_SECTION_KEYS,
  HOME_STORE_PICKS_MAX,
  HOME_UPLOAD_BUCKET,
  cloneHomeLayout,
  isSafeHomeHref,
  isSafeHomeImageUrl,
  normalizeHomeLayout,
  pickHomeText,
  resolveAudienceBanners,
  resolveHomeBannerMenuKey,
  resolveVisibleHomeSections,
  validateHomeLayoutPayload,
} from "@/lib/home/home-layout-contract";
import { homeHubMessages } from "@/lib/i18n/catalog/home-hub";

describe("home layout contract (홈 시안 v4 · 2026-11-14)", () => {
  it("칸 = 서비스 입구 → 배너 → 공지 한 줄 → 지금 우리 동네 (검색창·개인 칸 없음)", () => {
    expect([...HOME_SECTION_KEYS]).toEqual(["services", "banner", "notice", "feed"]);
    expect(DEFAULT_HOME_LAYOUT.sections.map((s) => s.key)).toEqual([...HOME_SECTION_KEYS]);
    expect(DEFAULT_HOME_LAYOUT.sections.every((s) => s.visible && s.guestVisible)).toBe(true);
    expect(HOME_SECTION_KEYS as readonly string[]).not.toContain("ongoing");
  });

  it("서비스 — 큰 칸 거래·배달, 작은 칸 정보 공유·모임·telRING·이벤트 (telRING = 화면 맨 위 대표 칸)", () => {
    const v = DEFAULT_HOME_LAYOUT.services.filter((s) => s.visible);
    expect(v.filter((s) => s.size === "large").map((s) => s.key)).toEqual(["trade", "stores"]);
    expect(v.filter((s) => s.size === "small").map((s) => s.key)).toEqual(["philife", "moim", "chat", "events"]);
    expect(HOME_MENU_CATALOG.moim.href).toBe("/moim");
  });

  it("옛 저장값(모임 없음)에는 모임을 기본 보이기로 붙인다 · 다른 빠진 메뉴는 꺼짐", () => {
    const c = normalizeHomeLayout({
      schemaVersion: 2,
      services: [
        { key: "trade", size: "large", visible: true },
        { key: "philife", size: "small", visible: true },
        { key: "events", size: "small", visible: true },
      ],
    });
    expect(c.services.find((s) => s.key === "moim")!.visible).toBe(true);
    expect(c.services.slice(0, 4).map((s) => s.key)).toEqual(["trade", "philife", "moim", "events"]);
    expect(c.services.find((s) => s.key === "chat")!.visible).toBe(false);
  });

  it("기본 배너 3개(정보 공유·telRING·배달, 시안 R3) — 문구는 카탈로그(한/영) · 16:9 꽉 찬 배너", () => {
    const b = DEFAULT_HOME_LAYOUT.banners;
    expect(b.map((x) => x.id)).toEqual(["dibay-info", "dibay-messenger", "dibay-delivery"]);
    expect(b.map((x) => x.href)).toEqual(["/philife", "/community-messenger?section=chats", "/stores"]);
    expect(b[1]!.title.ko).toBe(homeHubMessages.ko.home_banner_messenger_title);
    expect(b[1]!.title.en).toBe(homeHubMessages.en.home_banner_messenger_title);
    expect(b[1]!.chip.ko).toBe(homeHubMessages.ko.home_banner_messenger_chip);
    expect(b[1]!.ctaLabel.en).toBe(homeHubMessages.en.home_banner_messenger_cta);
    expect(b.every((x) => x.ratio === HOME_BANNER_HERO_RATIO)).toBe(true);
    expect(b.every((x) => x.imageUrl.startsWith("/images/home-banners/hero-"))).toBe(true);
    // 기본 문구도 어드민 저장 시 잘리지 않게 칸 최대 글자 안 (2026-11-18 운영 「DIPICK Deliv」 잘림)
    for (const x of b) {
      for (const lang of ["ko", "en"] as const) {
        expect(x.chip[lang].length).toBeLessThanOrEqual(HOME_BANNER_CHIP_MAX);
        expect(x.ctaLabel[lang].length).toBeLessThanOrEqual(HOME_BANNER_CTA_MAX);
        expect(x.title[lang].length).toBeLessThanOrEqual(HOME_BANNER_TITLE_MAX);
        expect(x.body[lang].length).toBeLessThanOrEqual(HOME_BANNER_BODY_MAX);
      }
    }
  });

  it("배너 서비스 표시·버튼 문구 — 저장값 정규화(12자) · 예전 저장값(칸 없음)은 빈 문구", () => {
    const c = normalizeHomeLayout({
      schemaVersion: 2,
      banners: [
        { id: "a", imageUrl: "/images/home-banners/hero-info.jpg", ratio: "16:9", title: { ko: "제목", en: "" }, chip: { ko: "가".repeat(20), en: "x" }, ctaLabel: { ko: "보기", en: "Go" }, href: "/philife" },
        { id: "b", imageUrl: "/images/home-banners/messenger.webp", ratio: "1:1", title: { ko: "예전", en: "" }, href: "/market" },
      ],
    });
    expect(c.banners[0]!.chip.ko).toHaveLength(HOME_BANNER_CHIP_MAX);
    expect(c.banners[0]!.ctaLabel).toEqual({ ko: "보기", en: "Go" });
    expect(c.banners[1]!.chip).toEqual({ ko: "", en: "" });
    expect(c.banners[1]!.ctaLabel).toEqual({ ko: "", en: "" });
    expect(c.banners[1]!.ratio).toBe("1:1");
  });

  it("배너 이동 곳 → 메뉴 (서비스 표시 자동·비로그인 안내 공용)", () => {
    expect(resolveHomeBannerMenuKey("/philife")).toBe("philife");
    expect(resolveHomeBannerMenuKey("/community-messenger?section=call_logs")).toBe("chat");
    expect(resolveHomeBannerMenuKey("/stores/abc")).toBe("stores");
    expect(resolveHomeBannerMenuKey("/unknown")).toBeNull();
    expect(resolveHomeBannerMenuKey("")).toBeNull();
  });

  it("깨진 저장값·예전 판(schemaVersion 1)은 기본값", () => {
    expect(normalizeHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(normalizeHomeLayout({ schemaVersion: 1, sections: [] })).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("칸 순서는 코드 고정 — 저장 순서·옛 칸(v22)은 버리고 보이기·제목만 이어받음", () => {
    const c = normalizeHomeLayout({
      schemaVersion: 2,
      sections: [
        { key: "banner", visible: false, guestVisible: true },
        { key: "ongoing", visible: true },
        { key: "services", visible: true },
        { key: "posts", visible: true },
        { key: "lifeInfo" },
      ],
    });
    expect(c.sections.map((s) => s.key)).toEqual(["services", "banner", "notice", "feed"]);
    expect(c.sections.find((s) => s.key === "banner")!.visible).toBe(false);
    expect(resolveVisibleHomeSections(c, true)).toEqual(["services", "notice", "feed"]);
  });

  it("배너 대상 — 전체/회원만/비로그인만, 끈 배너 제외", () => {
    const c = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    c.banners[0]!.audience = "member";
    c.banners[1]!.audience = "guest";
    c.banners[2]!.visible = false;
    expect(resolveAudienceBanners(c, true).map((b) => b.id)).toEqual(["dibay-messenger"]);
    expect(resolveAudienceBanners(c, false).map((b) => b.id)).toEqual(["dibay-info"]);
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

  it("링크 — 역슬래시·제어문자로 바깥 사이트 가는 우회 거절 (감사 E7)", () => {
    expect(isSafeHomeHref("/\\evil.com")).toBe(false);
    expect(isSafeHomeHref("/\\\\evil.com")).toBe(false);
    expect(isSafeHomeHref("/a\tb")).toBe(false);
    expect(isSafeHomeHref("/community-messenger?section=chats")).toBe(true);
    expect(isSafeHomeHref("/market#top")).toBe(true);
  });

  it("이미지 — 앱 정적 경로·우리 공개 버킷만 (아무 https 거절)", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    try {
      expect(isSafeHomeImageUrl(`https://abc.supabase.co/storage/v1/object/public/${HOME_UPLOAD_BUCKET}/_admin/home-banners/a.webp`)).toBe(true);
      expect(isSafeHomeImageUrl("https://abc.supabase.co/storage/v1/object/public/other-bucket/a.webp")).toBe(false);
      expect(isSafeHomeImageUrl("https://evil.example/a.webp")).toBe(false);
      expect(isSafeHomeImageUrl("http://abc.supabase.co/storage/v1/object/public/" + HOME_UPLOAD_BUCKET + "/a.webp")).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
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
