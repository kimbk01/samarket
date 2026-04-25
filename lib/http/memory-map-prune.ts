/**
 * 프로세스 내 Map 기반 캐시: TTL(만료) + 최대 **엔트리** 수(초과 시 먼저 넣은 순으로 제거).
 * 서버리스/멀티 인스턴스 간 공유는 하지 않으며, **단일 Node 프로세스** 메모리 누수·완만한 성능 저하 방지용.
 */

/**
 * `expiresAt <= now` 항목 제거 후, 여전히 `maxSize` 초과 시 `Map` 삽입 순(일반적으로 가장 오래된 키)부터 삭제.
 */
export function pruneByExpiresAtAndMaxSize<K, V extends { expiresAt: number }>(
  map: Map<K, V>,
  now: number,
  maxSize: number
): void {
  for (const [key, entry] of map) {
    if (entry.expiresAt <= now) map.delete(key);
  }
  while (map.size > maxSize) {
    const first = map.keys().next().value as K | undefined;
    if (first === undefined) break;
    map.delete(first);
  }
}

/**
 * `at` 기준으로 `maxAgeMs` 를 넘은 항목 제거 후, `maxSize` 초과 시 삽입 순 앞에서 삭제(전송 de-dupe 등).
 */
export function pruneByAtMaxAgeAndMaxSize<K, V extends { at: number }>(
  map: Map<K, V>,
  now: number,
  maxAgeMs: number,
  maxSize: number
): void {
  const cutoff = now - maxAgeMs;
  for (const [key, entry] of map) {
    if (entry.at <= cutoff) map.delete(key);
  }
  while (map.size > maxSize) {
    const first = map.keys().next().value as K | undefined;
    if (first === undefined) break;
    map.delete(first);
  }
}
