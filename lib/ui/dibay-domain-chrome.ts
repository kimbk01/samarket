/**
 * DIBAY 헤더 도메인 색 — 단일 정의 (헤더 SSOT 3단계, Owner 「3단계 구현」 2026-11-13,
 * 설계 `docs/audit/header-consistency-audit-2026-11-13.md` §4).
 *
 * C1 색 id = 하단 탭 5개(`home`·`community`·`delivery`·`chat`·`mypage`). 판정 = 하단 탭 켜짐과 같은 `resolveMainSurface`
 *    (거래 `/market`·`/post`·`/write` 와 모임 = 커뮤니티 탭 → 커뮤니티 색).
 * C2 탭에 속하지 않는 공용 화면(알림·전체 검색·설정·주소·고객센터·프로필)은 **들어온 탭의 색**
 *    (`dibay-chrome-entry-tab` 기록). 기록이 없으면(앱 첫 진입·알림 푸시) 내정보 색.
 * C3 헤더 셸은 `data-dibay-domain` + `var(--dibay-domain-surface)` 만 쓴다(하드코딩 배경 금지).
 * C4 상태바 영역과 헤더 줄은 같은 색.
 * C5 값은 이 파일이 원본 — `app/dibay-chrome-ssot.css` 는 같은 값(시험으로 고정).
 * FEATURE PRESERVATION: 색 토큰만 — 헤더 동작·탭을 추가하지 않는다.
 */

import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import {
  readDibayChromeEntryTab,
  subscribeDibayChromeEntryTab,
} from "@/lib/ui/dibay-chrome-entry-tab";

/**
 * 도메인 색 = 설계 §4-3 제안 1안 (Owner 「권장안대로」 2026-11-13). 교체는 이 표와 `app/dibay-chrome-ssot.css` :root 표 두 곳만.
 * surface = 헤더·상태바·2단 탭 줄 바탕, tabIdleBg = 2단 알약 탭(안 고른 것) 바탕.
 */
export const DIBAY_DOMAIN_CHROME = {
  home: {
    surface: "#F3F5F3",
    accent: "#0B421A",
    accentText: "#FFFFFF",
    tabIdleBg: "#F8F9F8",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  community: {
    surface: "#E3F1E7",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#F1F8F3",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  delivery: {
    surface: "#FDEEDC",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#FEF6EC",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  chat: {
    surface: "#E3EDFB",
    accent: "#296044",
    accentText: "#FFFFFF",
    tabIdleBg: "#F1F6FD",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  mypage: {
    surface: "#EFEAF6",
    accent: "#243832",
    accentText: "#FFFFFF",
    tabIdleBg: "#F7F4FA",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 10%, transparent)",
  },
  /** 하단 탭·공용 화면 어디에도 속하지 않는 화면(관리자·로그인 등) — 루트 기본 */
  other: {
    surface: "#F9F9F9",
    accent: "#243832",
    accentText: "#FFFFFF",
    tabIdleBg: "#F2F0EB",
    tabIdleFg: "#243832",
    divider: "color-mix(in srgb, #243832 8%, transparent)",
  },
} as const;

export type DibayDomainChromeId = keyof typeof DIBAY_DOMAIN_CHROME;
/** 하단 탭 5개 — 공용 화면이 이어받을 수 있는 색 */
export type DibayTabDomainChromeId = Exclude<DibayDomainChromeId, "other">;

export const DIBAY_TAB_DOMAIN_CHROME_IDS: readonly DibayTabDomainChromeId[] = [
  "home",
  "community",
  "delivery",
  "chat",
  "mypage",
];

/** 하단 탭 판정이 `other` 지만 특정 탭 소속인 화면 (그룹 채팅 → 채팅) */
export const DIBAY_CHROME_TAB_OWNED_PATH_PREFIXES: readonly { prefix: string; id: DibayTabDomainChromeId }[] = [
  { prefix: "/group-chat", id: "chat" },
  { prefix: "/group", id: "chat" },
];

/** 하단 탭 판정(`resolveMainSurface`) → 색 id. 거래는 커뮤니티 탭 안이라 커뮤니티 색 */
export function resolveDibayTabDomainForPath(pathname: string | null | undefined): DibayTabDomainChromeId | null {
  const surface = resolveMainSurface(pathname);
  if (surface === "home") return "home";
  if (surface === "community" || surface === "trade") return "community";
  if (surface === "delivery" || surface === "chat" || surface === "mypage") return surface;
  const p = normalizeAppPathnameForTier1(pathname);
  for (const row of DIBAY_CHROME_TAB_OWNED_PATH_PREFIXES) {
    if (p === row.prefix || p.startsWith(`${row.prefix}/`)) return row.id;
  }
  return null;
}

/**
 * C2 공용 화면 — 들어온 탭의 색을 쓴다. 기록이 없으면 `DIBAY_CHROME_SHARED_FALLBACK`.
 * (2026-10-21 Q2 「항상 내정보 색」을 헤더 SSOT 3단계가 대체 — 설계 §6 충돌 4번)
 */
export const DIBAY_CHROME_SHARED_PATH_PREFIXES: readonly string[] = [
  "/notifications",
  "/search",
  "/settings",
  "/address",
  "/support",
  "/u",
];

export const DIBAY_CHROME_SHARED_FALLBACK: DibayTabDomainChromeId = "mypage";

export function isDibayChromeSharedPath(pathname: string | null | undefined): boolean {
  const p = normalizeAppPathnameForTier1(pathname);
  return DIBAY_CHROME_SHARED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** 경로 → 색 id (순수 함수). `entryTab` = 공용 화면에 들어오기 직전 탭(없으면 내정보). */
export function resolveDibayDomainChromeIdForPath(
  pathname: string | null | undefined,
  entryTab: DibayTabDomainChromeId | null = null
): DibayDomainChromeId {
  if (isDibayChromeSharedPath(pathname)) return entryTab ?? DIBAY_CHROME_SHARED_FALLBACK;
  return resolveDibayTabDomainForPath(pathname) ?? "other";
}

export function dibayDomainChromeCssVarsForId(id: DibayDomainChromeId): CSSProperties {
  const t = DIBAY_DOMAIN_CHROME[id];
  return {
    ["--dibay-domain-surface" as string]: t.surface,
    ["--dibay-domain-accent" as string]: t.accent,
    ["--dibay-domain-accent-text" as string]: t.accentText,
    ["--dibay-domain-tab-idle-bg" as string]: t.tabIdleBg,
    ["--dibay-domain-tab-idle-fg" as string]: t.tabIdleFg,
    ["--dibay-domain-divider" as string]: t.divider,
    ["--sector-header-bg" as string]: t.surface,
    ["--sector-header-border" as string]: t.divider,
    ["--sector-header-title-color" as string]: "#243832",
    ["--sector-header-icon-color" as string]: "#243832",
    ["--sector-header-back-color" as string]: "#243832",
    ["--sector-header-icon-active-color" as string]: t.accent,
  };
}

/** 고정 도메인 화면(홈 등)의 셸 속성 — SSR 첫 화면부터 같은 색 */
export function dibayDomainChromeElementPropsForId(id: DibayDomainChromeId): {
  "data-dibay-domain": DibayDomainChromeId;
  style: CSSProperties;
} {
  return { "data-dibay-domain": id, style: dibayDomainChromeCssVarsForId(id) };
}

/**
 * 렌더 중 색 id — 공용 화면은 들어온 탭 기록을 읽는다.
 * 서버·하이드레이션 첫 렌더는 기록 없음(내정보) → 하이드레이션 직후 기록 값으로 다시 그린다(속성 불일치 없음).
 * 앱 안 이동(클라이언트)은 첫 렌더부터 기록 값.
 */
export function useDibayDomainChromeId(pathname: string | null | undefined): DibayDomainChromeId {
  const entryTab = useSyncExternalStore(subscribeDibayChromeEntryTab, readDibayChromeEntryTab, () => null);
  return resolveDibayDomainChromeIdForPath(pathname, entryTab);
}

export function useDibayDomainChromeElementProps(pathname: string | null | undefined): {
  "data-dibay-domain": DibayDomainChromeId;
  style: CSSProperties;
} {
  return dibayDomainChromeElementPropsForId(useDibayDomainChromeId(pathname));
}
