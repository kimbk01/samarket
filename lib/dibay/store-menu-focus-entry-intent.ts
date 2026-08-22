/**
 * browse 대표메뉴 tap → store focus entry 사이 preparing 즉시 시작.
 * (searchParams hydrate 전 wrong store frame 노출 방지)
 */
let armedFocusProductId: string | null = null;

export function armStoreMenuFocusEntryIntent(focusProductId: string | null | undefined): void {
  const id = focusProductId?.trim() || null;
  armedFocusProductId = id;
}

export function peekStoreMenuFocusEntryIntent(): string | null {
  return armedFocusProductId;
}

export function clearStoreMenuFocusEntryIntent(): void {
  armedFocusProductId = null;
}
