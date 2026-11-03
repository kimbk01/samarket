/**
 * 열린 오버레이(DibayOverlayRoot) 수 — 광고 감사 G-8.
 * 확인창·바텀시트·전체 시트가 열려 있으면 팝업 광고를 띄우지 않는다
 * (`docs/dibay-global-popup-ad-product-contract-lock.md` §6 「critical dialog」).
 * 광고 자신(팝업)은 `ad: true` 로 등록해 세지 않는다.
 */

type Entry = { id: number; ad: boolean };

const entries: Entry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
let nonAdCount = 0;

function emit(): void {
  nonAdCount = entries.filter((e) => !e.ad).length;
  for (const l of listeners) l();
}

/** @returns release — 오버레이가 닫히거나 언마운트될 때 호출 */
export function registerOpenOverlay(opts: { ad: boolean }): () => void {
  const entry: Entry = { id: nextId++, ad: opts.ad };
  entries.push(entry);
  emit();
  return () => {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) entries.splice(i, 1);
    emit();
  };
}

export function subscribeOpenOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 광고가 아닌 열린 오버레이 수 */
export function readNonAdOpenOverlayCount(): number {
  return nonAdCount;
}
