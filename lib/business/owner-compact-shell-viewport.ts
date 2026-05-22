/**
 * 매장 오너 운영 셸 — 모바일·태블릿 컴팩트 레이아웃 단일 기준.
 *
 * `app/design-tokens.css` 와 동기:
 * - `--sam-bp-mobile-max`: 767px
 * - `--sam-bp-sm-tablet-min`: 768px
 * - `--sam-bp-lg-min`: 1024px → 컴팩트 상한(이 값 포함)
 *
 * Tailwind 기본 `md`(768)·`lg`(1024) 만으로 오너 셸을 나누면 iPad 1024에서
 * 하단 탭·드로어·햄버거 분기가 어긋난다. JS·CSS 모두 여기 상한을 쓴다.
 */
export const OWNER_COMPACT_SHELL_MAX_PX = 1024;
export const OWNER_DESKTOP_SHELL_MIN_PX = OWNER_COMPACT_SHELL_MAX_PX + 1;

/** `--sam-bp-sm-tablet-min` — `owner-compact-shell.css` 태블릿 밴드 시작 */
export const OWNER_COMPACT_TABLET_LAYOUT_MIN_PX = 768;

/** `--sam-bp-sm-tablet-max` */
export const OWNER_COMPACT_TABLET_LAYOUT_MAX_PX = 1023;

export const OWNER_COMPACT_SHELL_MEDIA_QUERY = `(max-width: ${OWNER_COMPACT_SHELL_MAX_PX}px)`;

/** Tailwind JIT — 문자열 전체를 상수로 두어 purge 누락 방지 */
export const OWNER_COMPACT_SHELL_MAX_TW = "max-[1024px]" as const;
export const OWNER_DESKTOP_SHELL_MIN_TW = "min-[1025px]" as const;
export const OWNER_COMPACT_TABLET_LAYOUT_MIN_TW = "min-[768px]" as const;

export function matchesOwnerCompactShellViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(OWNER_COMPACT_SHELL_MEDIA_QUERY).matches;
}
