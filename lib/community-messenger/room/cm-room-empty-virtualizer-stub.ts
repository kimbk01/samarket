import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";

/** composer·pass1 선커밋 구간 — @tanstack/react-virtual 초기화 전 타임라인 placeholder. */
export const CM_ROOM_EMPTY_VIRTUALIZER_STUB = {
  getVirtualItems: (): VirtualItem[] => [],
  getTotalSize: () => 0,
  measureElement: () => undefined,
  scrollToIndex: () => undefined,
  scrollToOffset: () => undefined,
  scrollBy: () => undefined,
  getScrollOffset: () => 0,
  range: null,
  options: {} as Virtualizer<HTMLDivElement, Element>["options"],
} as unknown as Virtualizer<HTMLDivElement, Element>;
