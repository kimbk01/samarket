/**
 * WP6 (배민형 2차수 2026-10-29) — 매장 화면 표시 규칙 순수 함수.
 * 명세: `docs/audit/delivery-baemin-master-plan-2026-10-29.md` WP6
 * 화면: `StoreDetailPublic` · `StoreOrderHeroSummary` · `StoreDetailMenusSection` · `ProductMenuCard`
 */
import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import type { AutoBusinessHoursConfig } from "@/lib/stores/store-auto-hours";
import {
  getZonedDayInfo,
  hhmmToMinutesStrict,
  shiftStoreYmd,
  storeIntervalsForBusinessDay,
  STORE_WEEKDAY_KEYS,
  type StoreWeekdayKey,
} from "@/lib/stores/store-weekly-hours";

/* ───────────────────────── 상단 배너(히어로) 이미지 순서 ───────────────────────── */

export type StoreDetailHeroSource =
  | { kind: "banners"; viewerUrls: string[] }
  | { kind: "gallery"; imageUrl: string; viewerUrls: string[] }
  | { kind: "menu_photo"; imageUrl: string; viewerUrls: string[] }
  | { kind: "solid"; viewerUrls: [] };

function cleanUrls(urls: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const s = typeof u === "string" ? u.trim() : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * 히어로 이미지 순서: 사장님 매장 배너(`store_banners`) → 갤러리 → 이미 받은 메뉴 중 첫 사진 → 단색.
 * `viewerUrls` = 히어로를 눌렀을 때 전체 화면 사진 보기 목록.
 */
export function resolveStoreDetailHeroSource(input: {
  bannerImageUrls: readonly (string | null | undefined)[];
  galleryUrls: readonly (string | null | undefined)[];
  menuThumbnailUrls: readonly (string | null | undefined)[];
}): StoreDetailHeroSource {
  const banners = cleanUrls(input.bannerImageUrls);
  if (banners.length > 0) return { kind: "banners", viewerUrls: banners };
  const gallery = cleanUrls(input.galleryUrls);
  if (gallery.length > 0) return { kind: "gallery", imageUrl: gallery[0]!, viewerUrls: gallery };
  const menu = cleanUrls(input.menuThumbnailUrls);
  if (menu.length > 0) return { kind: "menu_photo", imageUrl: menu[0]!, viewerUrls: [menu[0]!] };
  return { kind: "solid", viewerUrls: [] };
}

/* ───────────────────────── 메뉴 행 — 옵션별 가격 줄 ───────────────────────── */

export type MenuRowOptionPriceLine = { label: string; pricePhp: number };

/**
 * 첫 필수 단일 선택 그룹의 옵션이 2~3개면 「• 옵션 : 가격」 줄 목록, 아니면 null(단일 가격 표시).
 * 가격 = 판매가(할인 있으면 할인가) + 옵션 추가금.
 */
export function buildMenuRowOptionPriceLines(
  groups: readonly ParsedOptionGroup[] | null | undefined,
  baseSalePricePhp: number
): MenuRowOptionPriceLine[] | null {
  if (!groups || groups.length === 0) return null;
  const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = sorted.find((g) => g.isRequired && g.inputType !== "quantity" && g.inputType !== "checkbox");
  if (!first) return null;
  if (first.maxSelect !== 1) return null;
  const opts = first.options;
  if (opts.length < 2 || opts.length > 3) return null;
  const base = Number.isFinite(baseSalePricePhp) ? Math.max(0, baseSalePricePhp) : 0;
  return opts.map((o) => ({
    label: o.name,
    pricePhp: Math.max(0, Math.round(base + (Number.isFinite(o.priceDelta) ? o.priceDelta : 0))),
  }));
}

/* ───────────────────────── 메뉴 탭 칩 (첫 칩 「인기 메뉴」) ───────────────────────── */

/** 인기 메뉴 영역 앵커 id — 칩 「인기 메뉴」 이동 대상 */
export const STORE_DETAIL_POPULAR_SECTION_DOM_ID = "store-popular-sec";

/** 칩을 눌러 이동한 뒤 scroll spy 를 잠그는 시간 — 즉시 이동(behavior auto) 기준 */
export const STORE_MENU_CHIP_JUMP_LOCK_MS = 150;

/** spy 잠금 대상 — 인기 메뉴 영역 */
export const STORE_MENU_SPY_POPULAR_TARGET = -1;

export type StoreMenuChipTarget = { kind: "popular" } | { kind: "section"; index: number };

/** 인기 메뉴가 있으면 칩 0 = 인기 메뉴, 나머지는 메뉴 구역 순서 그대로 */
export function buildStoreMenuChipLabels(input: {
  hasPopular: boolean;
  popularLabel: string;
  sectionLabels: readonly string[];
}): string[] {
  return input.hasPopular ? [input.popularLabel, ...input.sectionLabels] : [...input.sectionLabels];
}

export function storeMenuChipTargetForIndex(hasPopular: boolean, chipIndex: number): StoreMenuChipTarget {
  if (hasPopular) {
    if (chipIndex <= 0) return { kind: "popular" };
    return { kind: "section", index: chipIndex - 1 };
  }
  return { kind: "section", index: Math.max(0, chipIndex) };
}

export function storeMenuActiveChipIndex(input: {
  hasPopular: boolean;
  popularActive: boolean;
  activeSection: number;
}): number {
  if (!input.hasPopular) return Math.max(0, input.activeSection);
  if (input.popularActive) return 0;
  return Math.max(0, input.activeSection) + 1;
}

/* ───────────────────────── 칩 줄 따라가기 (가로만) ───────────────────────── */

/**
 * 선택 칩이 칩 줄 안에 보이도록 할 가로 scrollLeft (inline: "nearest" 와 같은 규칙).
 * 이미 보이면 null → 움직이지 않음. 세로 스크롤은 절대 건드리지 않도록 호출부가 이 값으로 scrollLeft 만 바꾼다.
 */
export function resolveChipRowScrollLeft(input: {
  rowScrollLeft: number;
  rowClientWidth: number;
  rowScrollWidth: number;
  chipOffsetLeft: number;
  chipWidth: number;
  edgePaddingPx?: number;
}): number | null {
  const pad = Math.max(0, input.edgePaddingPx ?? 12);
  const viewL = input.rowScrollLeft;
  const viewR = input.rowScrollLeft + input.rowClientWidth;
  const chipL = input.chipOffsetLeft;
  const chipR = input.chipOffsetLeft + input.chipWidth;
  const maxLeft = Math.max(0, input.rowScrollWidth - input.rowClientWidth);
  let next: number | null = null;
  if (chipL - pad < viewL) next = chipL - pad;
  else if (chipR + pad > viewR) next = chipR + pad - input.rowClientWidth;
  if (next == null) return null;
  const clamped = Math.max(0, Math.min(maxLeft, Math.round(next)));
  return clamped === Math.round(input.rowScrollLeft) ? null : clamped;
}

/**
 * 칩 줄 따라가기 가드 — 칩 줄이 화면 세로 범위 안에 있을 때만(고정 탭 또는 보이는 흐름 탭).
 * 화면 밖 칩 줄을 따라가려다 페이지가 세로로 움직이는 것을 막는다.
 */
export function shouldFollowActiveChip(input: {
  rowTop: number;
  rowBottom: number;
  viewportHeight: number;
  userTouchingRow: boolean;
}): boolean {
  if (input.userTouchingRow) return false;
  if (!(input.viewportHeight > 0)) return false;
  return input.rowBottom > 0 && input.rowTop < input.viewportHeight;
}

/* ───────────────────────── 영업 종료 — 다음 오픈 ───────────────────────── */

export type StoreNextOpen = { dayOffset: number; weekdayKey: StoreWeekdayKey; openHHmm: string };

/**
 * 자동 영업시간 설정 기준 다음 오픈 시각 (오늘 남은 구간 → 최대 7일 뒤).
 * 수동 마감·설정 없음이면 null (표시하지 않음).
 */
export function resolveStoreNextOpen(
  cfg: AutoBusinessHoursConfig | null,
  now: Date
): StoreNextOpen | null {
  if (!cfg) return null;
  const info = getZonedDayInfo(now, cfg.timezone);
  if (!info) return null;
  const model = {
    open: cfg.open,
    close: cfg.close,
    weekly: cfg.weekly ?? null,
    closedDates: cfg.closedDates ?? [],
  };
  for (let d = 0; d <= 7; d += 1) {
    const ymd = shiftStoreYmd(info.ymd, d);
    const weekday = (info.weekday + d) % 7;
    const ivs = storeIntervalsForBusinessDay(model, ymd, weekday)
      .map((iv) => ({ open: iv.open, m: hhmmToMinutesStrict(iv.open) }))
      .filter((x): x is { open: string; m: number } => x.m != null)
      .sort((a, b) => a.m - b.m);
    const hit = d === 0 ? ivs.find((x) => x.m > info.minutes) : ivs[0];
    if (hit) {
      return { dayOffset: d, weekdayKey: STORE_WEEKDAY_KEYS[weekday]!, openHHmm: hit.open };
    }
  }
  return null;
}

/* ───────────────────────── 하단 띠 합계 ───────────────────────── */

/** 원가 합계가 결제 합계보다 클 때만 취소선 원가 표시 */
export function resolveCartStripTotals(subtotalPhp: number, listSubtotalPhp: number | null | undefined): {
  totalPhp: number;
  originalPhp: number | null;
} {
  const total = Number.isFinite(subtotalPhp) ? Math.max(0, subtotalPhp) : 0;
  const list = listSubtotalPhp != null && Number.isFinite(listSubtotalPhp) ? listSubtotalPhp : null;
  return { totalPhp: total, originalPhp: list != null && list > total ? list : null };
}
