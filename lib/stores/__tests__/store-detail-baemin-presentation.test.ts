import { describe, expect, it } from "vitest";
import {
  buildMenuRowOptionPriceLines,
  buildStoreMenuChipLabels,
  resolveCartStripTotals,
  resolveChipRowScrollLeft,
  resolveStoreDetailHeroSource,
  resolveStoreNextOpen,
  shouldFollowActiveChip,
  STORE_MENU_CHIP_JUMP_LOCK_MS,
  storeMenuActiveChipIndex,
  storeMenuChipTargetForIndex,
} from "@/lib/stores/store-detail-baemin-presentation";
import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import type { AutoBusinessHoursConfig } from "@/lib/stores/store-auto-hours";

/** WP6 (배민형 2차수 2026-10-29) — 매장 화면 표시 규칙 */
describe("WP6 hero source order", () => {
  it("배너 → 갤러리 → 메뉴 사진 → 단색", () => {
    expect(
      resolveStoreDetailHeroSource({ bannerImageUrls: ["b1", "b2"], galleryUrls: ["g1"], menuThumbnailUrls: ["m1"] })
    ).toEqual({ kind: "banners", viewerUrls: ["b1", "b2"] });
    expect(
      resolveStoreDetailHeroSource({ bannerImageUrls: [" "], galleryUrls: ["g1", "g2"], menuThumbnailUrls: ["m1"] })
    ).toEqual({ kind: "gallery", imageUrl: "g1", viewerUrls: ["g1", "g2"] });
    expect(
      resolveStoreDetailHeroSource({ bannerImageUrls: [], galleryUrls: [], menuThumbnailUrls: [null, "", "m2", "m3"] })
    ).toEqual({ kind: "menu_photo", imageUrl: "m2", viewerUrls: ["m2"] });
    expect(resolveStoreDetailHeroSource({ bannerImageUrls: [], galleryUrls: [], menuThumbnailUrls: [] })).toEqual({
      kind: "solid",
      viewerUrls: [],
    });
  });
});

describe("WP6 option price lines", () => {
  const opt = (name: string, priceDelta: number) => ({
    key: name,
    name,
    priceDelta,
    soldOut: false,
    defaultSelected: false,
  });
  const group = (over: Partial<ParsedOptionGroup>): ParsedOptionGroup => ({
    key: "g",
    label: "크기",
    description: "",
    sortOrder: 0,
    inputType: "radio",
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    options: [opt("보통", 0), opt("곱빼기", 2000)],
    ...over,
  });

  it("첫 필수 단일 그룹 2~3개 → 「옵션 : 가격」 줄", () => {
    expect(buildMenuRowOptionPriceLines([group({})], 8000)).toEqual([
      { label: "보통", pricePhp: 8000 },
      { label: "곱빼기", pricePhp: 10000 },
    ]);
  });

  it("옵션 1개·4개 이상·선택 그룹·다중 선택이면 null(단일 가격)", () => {
    expect(buildMenuRowOptionPriceLines([group({ options: [opt("a", 0)] })], 1)).toBeNull();
    expect(
      buildMenuRowOptionPriceLines([group({ options: [opt("a", 0), opt("b", 0), opt("c", 0), opt("d", 0)] })], 1)
    ).toBeNull();
    expect(buildMenuRowOptionPriceLines([group({ isRequired: false })], 1)).toBeNull();
    expect(buildMenuRowOptionPriceLines([group({ maxSelect: 2 })], 1)).toBeNull();
    expect(buildMenuRowOptionPriceLines([], 1)).toBeNull();
    expect(buildMenuRowOptionPriceLines(null, 1)).toBeNull();
  });

  it("정렬 순서상 첫 필수 그룹 기준", () => {
    const lines = buildMenuRowOptionPriceLines(
      [
        group({ key: "late", sortOrder: 5, options: [opt("x", 1), opt("y", 2)] }),
        group({ key: "early", sortOrder: 1, options: [opt("S", 0), opt("L", 500)] }),
      ],
      1000
    );
    expect(lines?.map((l) => l.label)).toEqual(["S", "L"]);
  });
});

describe("WP6 menu chips", () => {
  it("인기 메뉴가 있으면 첫 칩 「인기 메뉴」", () => {
    expect(buildStoreMenuChipLabels({ hasPopular: true, popularLabel: "인기 메뉴", sectionLabels: ["대표", "면"] })).toEqual([
      "인기 메뉴",
      "대표",
      "면",
    ]);
    expect(buildStoreMenuChipLabels({ hasPopular: false, popularLabel: "인기 메뉴", sectionLabels: ["대표"] })).toEqual([
      "대표",
    ]);
  });

  it("칩 ↔ 대상 · spy → 선택 칩", () => {
    expect(storeMenuChipTargetForIndex(true, 0)).toEqual({ kind: "popular" });
    expect(storeMenuChipTargetForIndex(true, 2)).toEqual({ kind: "section", index: 1 });
    expect(storeMenuChipTargetForIndex(false, 2)).toEqual({ kind: "section", index: 2 });
    expect(storeMenuActiveChipIndex({ hasPopular: true, popularActive: true, activeSection: 3 })).toBe(0);
    expect(storeMenuActiveChipIndex({ hasPopular: true, popularActive: false, activeSection: 1 })).toBe(2);
    expect(storeMenuActiveChipIndex({ hasPopular: false, popularActive: true, activeSection: 1 })).toBe(1);
  });

  it("즉시 이동 잠금 150ms", () => {
    expect(STORE_MENU_CHIP_JUMP_LOCK_MS).toBe(150);
  });
});

describe("WP6 chip-follow guard", () => {
  const base = { rowScrollLeft: 0, rowClientWidth: 300, rowScrollWidth: 900, chipWidth: 60, edgePaddingPx: 12 };

  it("이미 보이면 움직이지 않음", () => {
    expect(resolveChipRowScrollLeft({ ...base, chipOffsetLeft: 100 })).toBeNull();
  });

  it("오른쪽 밖 → 오른쪽 끝에 맞춤 / 왼쪽 밖 → 왼쪽에 맞춤", () => {
    expect(resolveChipRowScrollLeft({ ...base, chipOffsetLeft: 400 })).toBe(400 + 60 + 12 - 300);
    expect(resolveChipRowScrollLeft({ ...base, rowScrollLeft: 300, chipOffsetLeft: 200 })).toBe(188);
  });

  it("최대 스크롤 범위로 자름", () => {
    expect(resolveChipRowScrollLeft({ ...base, chipOffsetLeft: 880, chipWidth: 20 })).toBe(600);
    expect(resolveChipRowScrollLeft({ ...base, rowScrollLeft: 50, chipOffsetLeft: 5 })).toBe(0);
  });

  it("칩 줄이 화면 밖이거나 손가락으로 끄는 중이면 따라가지 않음", () => {
    expect(shouldFollowActiveChip({ rowTop: 100, rowBottom: 148, viewportHeight: 800, userTouchingRow: false })).toBe(true);
    expect(shouldFollowActiveChip({ rowTop: -100, rowBottom: -52, viewportHeight: 800, userTouchingRow: false })).toBe(
      false
    );
    expect(shouldFollowActiveChip({ rowTop: 900, rowBottom: 948, viewportHeight: 800, userTouchingRow: false })).toBe(
      false
    );
    expect(shouldFollowActiveChip({ rowTop: 100, rowBottom: 148, viewportHeight: 800, userTouchingRow: true })).toBe(false);
  });
});

describe("WP6 next open", () => {
  const cfg = (over: Partial<AutoBusinessHoursConfig> = {}): AutoBusinessHoursConfig => ({
    enabled: true,
    timezone: "Asia/Manila",
    open: "11:00",
    close: "21:00",
    weekly: null,
    closedDates: [],
    ...over,
  });
  // 2026-10-29(목) 08:00 PHT = 00:00Z
  const morning = new Date("2026-10-29T00:00:00Z");
  // 2026-10-29(목) 22:00 PHT = 14:00Z
  const night = new Date("2026-10-29T14:00:00Z");

  it("오늘 남은 오픈 → 오늘", () => {
    expect(resolveStoreNextOpen(cfg(), morning)).toEqual({ dayOffset: 0, weekdayKey: "thu", openHHmm: "11:00" });
  });

  it("영업 종료 후 → 내일", () => {
    expect(resolveStoreNextOpen(cfg(), night)).toEqual({ dayOffset: 1, weekdayKey: "fri", openHHmm: "11:00" });
  });

  it("휴무일 건너뜀", () => {
    expect(resolveStoreNextOpen(cfg({ closedDates: ["2026-10-30"] }), night)).toEqual({
      dayOffset: 2,
      weekdayKey: "sat",
      openHHmm: "11:00",
    });
  });

  it("설정 없음 → null", () => {
    expect(resolveStoreNextOpen(null, night)).toBeNull();
  });
});

describe("WP6 bottom strip totals", () => {
  it("정가 합계가 클 때만 취소선", () => {
    expect(resolveCartStripTotals(900, 1000)).toEqual({ totalPhp: 900, originalPhp: 1000 });
    expect(resolveCartStripTotals(900, 900)).toEqual({ totalPhp: 900, originalPhp: null });
    expect(resolveCartStripTotals(900, null)).toEqual({ totalPhp: 900, originalPhp: null });
  });
});
