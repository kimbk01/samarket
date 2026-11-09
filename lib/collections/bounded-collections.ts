/**
 * 오래 켜 둔 앱(며칠 단위)에서 모듈 전역 Set·Map 이 끝없이 커지지 않게 하는 상한 헬퍼.
 *
 * - JS `Set`·`Map` 은 넣은 순서를 기억한다 → 가장 먼저 넣은 항목부터 버린다.
 * - `touch*` 는 다시 쓴 항목을 맨 뒤로 옮긴다(최근 사용 유지 — LRU).
 * - 상한은 「다시 요청·다시 계산하는 비용」 기준으로 각 호출부가 정한다(값은 호출부 주석에 근거).
 */

/** Set 에 넣고, 상한을 넘으면 가장 오래된 항목부터 버린다. 이미 있으면 맨 뒤로 옮긴다. */
export function addBounded<T>(set: Set<T>, value: T, max: number): void {
  if (set.has(value)) set.delete(value);
  set.add(value);
  trimSet(set, max);
}

/** Map 에 쓰고, 상한을 넘으면 가장 오래된 항목부터 버린다. 이미 있으면 맨 뒤로 옮긴다. */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  trimMap(map, max);
}

/** 읽으면서 최근 사용으로 표시 (없으면 undefined). */
export function getAndTouch<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
  return value;
}

function trimSet<T>(set: Set<T>, max: number): void {
  const limit = Math.max(1, Math.floor(max));
  while (set.size > limit) {
    const oldest = set.values().next();
    if (oldest.done) return;
    set.delete(oldest.value);
  }
}

function trimMap<K, V>(map: Map<K, V>, max: number): void {
  const limit = Math.max(1, Math.floor(max));
  while (map.size > limit) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}

/** 배열 끝에 넣고 앞에서부터 잘라 길이를 상한 이하로 유지 (고정 크기 기록 버퍼). */
export function pushBounded<T>(arr: T[], value: T, max: number): void {
  arr.push(value);
  const limit = Math.max(1, Math.floor(max));
  if (arr.length > limit) arr.splice(0, arr.length - limit);
}
