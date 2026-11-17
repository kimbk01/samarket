/**
 * 항목마다 비동기 작업을 동시에 최대 `limit` 개까지 실행한다(결과는 입력 순서).
 * 한 작업의 실패는 다른 작업을 멈추지 않는다 — 실패는 `{ ok: false, error }` 로 돌려준다.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const out: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length);
  const cap = Math.max(1, Math.floor(limit) || 1);
  let next = 0;
  const runOne = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        out[index] = { ok: true, value: await worker(items[index] as T, index) };
      } catch (error) {
        out[index] = { ok: false, error };
      }
    }
  };
  const lanes = Math.min(cap, items.length);
  await Promise.all(Array.from({ length: lanes }, () => runOne()));
  return out;
}
