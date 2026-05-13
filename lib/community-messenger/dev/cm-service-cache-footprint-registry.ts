/**
 * CM `service.ts` 캐시 footprint를 instrumentation 그래프와 분리한다.
 * `instrumentation.ts` → memory-watch 가 `service` 를 import 하면 Webpack 이
 * `service`(Node `crypto` 등)를 클라이언트/Edge 번들 그래프에 끌어와 `Can't resolve 'crypto'` 가 난다.
 * 서버에서 `service` 로드 시점에 여기에 getter 만 등록한다.
 */
let getFootprint: (() => Record<string, number>) | null = null;

export function registerCommunityMessengerServiceCacheFootprintGetter(
  fn: () => Record<string, number>
): void {
  getFootprint = fn;
}

export function getCommunityMessengerServiceCacheFootprintFromRegistry(): Record<
  string,
  number
> | null {
  if (!getFootprint) return null;
  try {
    return getFootprint();
  } catch {
    return null;
  }
}
