/**
 * 쓰기 시점 정리형 Map (P0-D · Owner 4단계 D 2026-11-09).
 *
 * - `ExpiringBoundedMap`: `set` 때 만료(`expiresAt <= now`) 항목을 실제로 지우고, 그래도 상한을 넘으면 오래 넣은 순으로 지운다.
 *   「읽을 때만 TTL 검사」 캐시가 다시 방문하지 않은 키를 세션 끝까지 들고 있던 문제를 막는다.
 *   만료 항목을 읽지 않는(SWR 아님) 캐시에만 쓴다 — 읽기 동작·TTL 값은 바뀌지 않는다.
 * - `BoundedMap`: 만료 개념 없이 크기 상한만(만료 항목을 일부러 읽는 SWR 캐시·보조 타임스탬프 Map 용).
 * 정리 비용은 set 1회당 O(상한) — 상한이 작아(≤100) 무시 가능.
 */
export class ExpiringBoundedMap<K, V extends { expiresAt: number }> extends Map<K, V> {
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries: number, now: () => number = () => Date.now()) {
    super();
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.now = now;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    const t = this.now();
    for (const [k, v] of super.entries()) {
      if (k !== key && v.expiresAt <= t) super.delete(k);
    }
    while (super.size > this.maxEntries) {
      const first = super.keys().next();
      if (first.done) break;
      super.delete(first.value);
    }
    return this;
  }
}

export class BoundedMap<K, V> extends Map<K, V> {
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    super();
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (super.size > this.maxEntries) {
      const first = super.keys().next();
      if (first.done) break;
      super.delete(first.value);
    }
    return this;
  }
}
