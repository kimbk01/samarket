/** 채팅·내정보 탭·매장 등 공통 미읽음 뱃지 — 아이콘 중앙 동그란 칩이 아니라 우상단 모서리(대각선)에 걸침. `right-0 top-0` + `translate-x-1/2 -translate-y-1/2` 로 모서리 점에 중심을 두어 앵커와 겹치는 면적 ≈ 배지의 1/4. */
export const OWNER_HUB_BADGE_DOT_CLASS =
  "pointer-events-none absolute right-0 top-0 z-[1] box-border flex h-4 min-h-4 min-w-4 max-w-[2rem] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold tabular-nums leading-none text-white shadow-sm ring-2 ring-white";
