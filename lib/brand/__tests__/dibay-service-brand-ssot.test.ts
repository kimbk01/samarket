import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIBAY_SERVICE_BRAND,
  DIBAY_SERVICE_BRAND_ICON_NAME,
  DIBAY_SERVICE_BRAND_ICON_PATH,
  DIBAY_SERVICE_BRAND_IDS,
  DIBAY_SERVICE_BRAND_PARENT,
} from "@/lib/brand/dibay-service-brand";
import { DIBAY_SERVICE_BRAND_KO } from "@/lib/i18n/brand-display-ko";
import { MESSAGES } from "@/lib/i18n/messages";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { BOTTOM_NAV_ICON_KEY_BRAND } from "@/components/main-menu/MainBottomNavTabIcons";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";

/**
 * 서비스 브랜드 SSOT (Owner 최종 승인 2026-11-13 · 2026-11-14 telRING·라운지 3개 한국어 표기) — 명칭·대표 아이콘·하단 탭 선택 상태를 잠근다.
 * 설계: docs/design/service-brand-icon-state-ssot-design-2026-11-13.md
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ko = MESSAGES.ko as unknown as Record<string, string>;
const en = MESSAGES.en as unknown as Record<string, string>;

describe("브랜드 명칭 SSOT", () => {
  it("공식 명칭 8개 (메시지 = telRING) · 한국어 화면은 LOUNGE 안 3개만 한글", () => {
    expect(DIBAY_SERVICE_BRAND).toEqual({
      HOME: "HOME",
      LOUNGE: "LOUNGE",
      FEED: "FEED",
      MARKET: "MARKET",
      CREW: "CREW",
      DIPICK: "DIPICK",
      LETARING: "telRING",
      MY: "MY",
    });
    expect(DIBAY_SERVICE_BRAND_KO).toEqual({ ...DIBAY_SERVICE_BRAND, FEED: "정보 공유", MARKET: "마켓", CREW: "모임" });
    expect(DIBAY_SERVICE_BRAND_PARENT.FEED).toBe("LOUNGE");
    expect(DIBAY_SERVICE_BRAND_PARENT.MARKET).toBe("LOUNGE");
    expect(DIBAY_SERVICE_BRAND_PARENT.CREW).toBe("LOUNGE");
  });

  it("하단 탭 5개 라벨 = HOME · LOUNGE · DIPICK · telRING · MY (ko·en 같음)", () => {
    const keys = BOTTOM_NAV_ITEMS.map((t) => t.labelKey!);
    expect(keys.map((k) => ko[k])).toEqual(["HOME", "LOUNGE", "DIPICK", "telRING", "MY"]);
    expect(keys.map((k) => en[k])).toEqual(["HOME", "LOUNGE", "DIPICK", "telRING", "MY"]);
    expect(BOTTOM_NAV_ITEMS.map((t) => t.label)).toEqual(["HOME", "LOUNGE", "DIPICK", "telRING", "MY"]);
  });

  it("LOUNGE 안 3단 탭 = ko 정보 공유·마켓·모임 / en FEED·MARKET·CREW, 허브 1단 제목도 같은 이름", () => {
    for (const [lang, B] of [[ko, DIBAY_SERVICE_BRAND_KO], [en, DIBAY_SERVICE_BRAND]] as const) {
      expect(lang.nav_community_switch_info).toBe(B.FEED);
      expect(lang.nav_bottom_trade).toBe(B.MARKET);
      expect(lang.moim_tab).toBe(B.CREW);
      expect(lang.tier1_moim).toBe(B.CREW);
      expect(lang.tier1_trade).toBe(B.MARKET);
      expect(lang.tier1_community).toBe(B.FEED);
      expect(lang.tier1_messenger).toBe("telRING");
      expect(lang.tier1_myinfo).toBe("MY");
      expect(lang.navigation_delivery).toBe("DIPICK");
    }
  });

  it("DIPICK 안 「홈」은 앱 HOME 과 다른 키 (nav.home 공유 금지)", () => {
    expect(ko.nav_bottom_dipick_home).toBe("DIPICK");
    expect(read("lib/main-menu/delivery-bottom-nav-layout.ts")).not.toMatch(/labelKey: "nav\.home"/);
  });

  it("옛 서비스 이름이 브랜드 자리에 남지 않는다 (SAMessenger · DIBAY MARKET · 사마켓 메신저)", () => {
    const brandSlots = [
      "nav_messenger_open_product_trade",
      "marketplace_sell_hub_subtitle",
      "marketplace_search_entry_aria",
      "trade_search_placeholder",
      "global_search_placeholder",
      "cm_ia_empty_trade",
    ];
    for (const k of brandSlots) {
      for (const lang of [ko, en]) {
        expect(lang[k], k).not.toMatch(/SAMessenger|DIBAY MARKET|사마켓 메신저|Marketplace/);
      }
    }
  });

  it("기능명은 한국어 그대로 (LEVEL 2) — 거래 신고·주문 내역 등은 바꾸지 않는다", () => {
    expect(ko.notif_bell_shortcut_trade).toBe("거래 내역");
    expect(ko.notif_bell_shortcut_orders).toBe("주문 내역");
  });
});

describe("대표 아이콘 SSOT", () => {
  it("브랜드 8개 = Phosphor Fill 8종, 경로 데이터 1벌", () => {
    expect(DIBAY_SERVICE_BRAND_ICON_NAME).toEqual({
      HOME: "PiHouseFill",
      LOUNGE: "PiUsersThreeFill",
      FEED: "PiNewspaperFill",
      MARKET: "PiShoppingBagFill",
      CREW: "PiFlagFill",
      DIPICK: "PiMopedFill",
      LETARING: "PiChatsCircleFill",
      MY: "PiUserCircleFill",
    });
    for (const id of DIBAY_SERVICE_BRAND_IDS) {
      expect(DIBAY_SERVICE_BRAND_ICON_PATH[id].length, id).toBeGreaterThan(40);
    }
    expect(new Set(Object.values(DIBAY_SERVICE_BRAND_ICON_PATH)).size).toBe(8);
  });

  it("하단 탭 아이콘 키 → 브랜드 (Lucide 덮어쓰기보다 브랜드 우선)", () => {
    expect(BOTTOM_NAV_ICON_KEY_BRAND).toEqual({
      home: "HOME",
      community: "LOUNGE",
      trade: "MARKET",
      stores: "DIPICK",
      chat: "LETARING",
      my: "MY",
    });
    expect(read("components/main-menu/MainBottomNavTabIcon.tsx")).toContain(
      "if (tab.lucideIcon && !BOTTOM_NAV_ICON_KEY_BRAND[tab.icon])"
    );
  });

  it("MY 하단 탭 = 내 프로필 사진 (Owner 2026-11-13 「원래대로 되돌려」 — 용어만 변경)", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("<BottomNavProfileAvatar />");
    expect(nav).toContain("app-bottom-nav-inline-icon app-bottom-nav-inline-icon--avatar");
    expect(read("components/layout/BottomNavProfileAvatar.tsx")).toContain("useAppBootProfile");
    const css = read("app/app-bottom-nav.css");
    expect(css).toMatch(/\[data-app-bottom-nav\] \.app-bottom-nav-container \.app-bottom-nav-inline-icon--avatar \{\n {2}width: 28px;\n {2}height: 28px;/);
    expect(css).toMatch(/\.app-bottom-nav-profile-avatar \{\n {2}display: block;\n {2}width: 26px;\n {2}height: 26px;/);
  });

  it("DIPICK FAB 진입 = DIPICK 아이콘(stores 키), 앱 HOME(home 키) 아님", () => {
    const fab = read("lib/main-menu/main-bottom-nav-fab-i18n.ts");
    const i = fab.indexOf('id: "fab_delivery_home"');
    expect(fab.slice(i, fab.indexOf("}", i))).toContain('icon: "stores"');
  });
});

describe("하단 탭 선택 상태 (텔레그램형)", () => {
  const css = read("app/app-bottom-nav.css");
  const start = css.indexOf("텔레그램형 하단 탭 (Owner 최종 승인 2026-11-13");
  const block = css.slice(start, css.indexOf("/* 채팅·허브 배지", start));

  it("26px 고정 · 선택 = #0B421A(--dibay-green) · 비선택 = --sam-icon-soft · 배경 없음 · 10px/500", () => {
    expect(block).toContain("--app-bottom-nav-accent: var(--dibay-green);");
    expect(block).toContain("--app-bottom-nav-icon-muted: var(--sam-icon-soft);");
    expect(block).toContain("--app-bottom-nav-text-muted: var(--sam-icon-soft);");
    expect(block).toContain("--app-bottom-nav-active-bg: transparent;");
    expect(block).toContain("--app-bottom-nav-icon-size: 26px;");
    expect(block).toContain("--app-bottom-nav-label-size: 10px;");
    expect(read("app/design-tokens.css")).toContain("--dibay-green: #0B421A;");
    expect(block).not.toMatch(/background: #111111|width: 30px|width: 18px/);
  });

  it("선택 글자 굵기 = 500 (굵기 변화 없음), 눌림 = 투명도(크기 변화 없음)", () => {
    expect(block).toMatch(/\.app-bottom-nav-label--philife-tab \{\n {2}font-size: var\(--app-bottom-nav-label-size\);\n {2}font-weight: 500;/);
    expect(block).not.toContain("font-weight: 700");
    expect(block).toMatch(/\[data-app-bottom-nav\] \.app-bottom-nav-item:active \{\n {2}opacity: 0\.55;/);
    // 축소(scale)는 사장님 하단 바 전용
    expect(css).toMatch(/:where\(\.app-bottom-nav-shell:not\(\[data-app-bottom-nav\]\)\) \.app-bottom-nav-item:active \{\n {2}transform: scale\(0\.97\);/);
  });

  it("탭 칸 높이 48px (터치 44px 이상) · 접근성 선택 상태 aria-current", () => {
    expect(css).toMatch(/\.app-bottom-nav-item \{\n {2}position: relative;[\s\S]*?height: 48px;/);
    expect(read("components/layout/BottomNav.tsx")).toContain('aria-current={isActive ? "page" : undefined}');
  });
});

describe("적용 범위 — 메인 하단 탭만 (사장님 하단 탭은 기존 2026-11-09 모양)", () => {
  const css = read("app/app-bottom-nav.css");
  it("텔레그램형 토큰은 :root 가 아니라 메인 하단 탭([data-app-bottom-nav])에만", () => {
    expect(css).toMatch(/\[data-app-bottom-nav\] \{\n {2}--app-bottom-nav-accent: var\(--dibay-green\);/);
    expect(css).toMatch(/:root \{\n {2}--app-bottom-nav-surface: rgba\(255, 255, 255, 0\.96\);\n {2}--app-bottom-nav-accent: #111111;/);
    expect(read("components/layout/BottomNav.tsx")).toContain('data-app-bottom-nav=""');
    expect(read("components/stores/owner/OwnerMobileBottomNav.tsx")).not.toContain("data-app-bottom-nav");
  });
  it("재감사 R3 — 덮어쓰기 없음: 크기·굵기 숫자 규칙은 사장님 하단 바 전용, 옛 브라운·6탭 10.5px 규칙 삭제", () => {
    const OWNER = ":where(.app-bottom-nav-shell:not([data-app-bottom-nav]))";
    const rules = css.split("}").map((r) => r.trim());
    for (const decl of ["width: 22px", "width: 24px", "width: 21px", "width: 30px", "width: 18px", "stroke-width: 2.4", "font-size: 11px", "font-size: 11.5px", "font-weight: 700", "transform: scale(0.97)"]) {
      const hits = rules.filter((r) => r.includes(decl + ";") && /\.app-bottom-nav-(item|icon-slot|inline-icon|icon-svg|label)\b/.test(r) && !/delivery|messenger-hub|domain-hub|orbit|badge/.test(r));
      for (const h of hits) expect(h.slice(0, h.indexOf("{")), decl).toContain(OWNER);
    }
    expect(css).not.toContain("--dibay-brown");
    expect(css).not.toContain('[data-tab-count="6"] .app-bottom-nav-label');
  });
});

describe("설계 행·결정 값 (재감사 R2)", () => {
  it("C7·D31·L1·M1", () => {
    for (const [lang, B] of [[ko, DIBAY_SERVICE_BRAND_KO], [en, DIBAY_SERVICE_BRAND]] as const) {
      expect(lang.notify_messenger_banner_title).toBe("telRING");
      expect(lang.admin_startup_config_surface_my).toBe("MY");
      expect(lang.feed_ad_req_trade).toBe(B.MARKET);
      expect(lang.feed_ad_req_community).toBe(B.FEED);
    }
    expect(ko.community_top_pin_cta).toBe("정보 공유 상위노출");
    expect(ko.trade_052).toBe("MY → 구매 내역");
  });
  it("T3 — 오류·권한 문장 속 「메신저」 = 「채팅」, 통화 화면 공용 문구는 그대로", () => {
    expect(ko.app_error_messenger_title).toBe("채팅을 불러오지 못했습니다.");
    expect(ko.nav_messenger_load_failed).not.toContain("telRING");
    expect(ko.nav_messenger_login_required).toBe("로그인 후 메신저를 사용할 수 있습니다.");
  });
});

describe("G-3 — /moim(CREW) 에서 LOUNGE 탭 선택", () => {
  const lounge = BOTTOM_NAV_ITEMS.find((t) => t.id === "community")!;
  const home = BOTTOM_NAV_ITEMS.find((t) => t.id === "home")!;
  it("/moim · /moim/하위 → LOUNGE 켜짐, HOME 꺼짐", () => {
    for (const p of ["/moim", "/moim/abc", "/philife", "/market"]) {
      expect(isMainBottomNavDisplayTabActive(p, lounge), p).toBe(true);
      expect(isMainBottomNavDisplayTabActive(p, home), p).toBe(false);
    }
  });
});
