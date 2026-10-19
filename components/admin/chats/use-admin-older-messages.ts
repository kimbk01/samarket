"use client";

/**
 * 채팅 Admin R1 (B · C-6) — 「이전 메시지 더 보기」 공용 훅.
 * 최신 페이지(`latest`)는 상위가 새로고침하고, 이 훅은 그보다 오래된 페이지만 누적한다 (id 커서 `before`).
 * 표시 순서: 오래된 → 최신. 같은 id 는 최신 페이지 값을 우선한다.
 */
import { useCallback, useMemo, useState } from "react";

export function useAdminOlderMessages<M extends { id: string }>(input: {
  /** 대상이 바뀌면 누적분을 버린다 (방 id 등) */
  resetKey: string;
  latest: readonly M[];
  latestHasMore: boolean;
  fetchOlder: (beforeId: string) => Promise<{ items: M[]; hasMore: boolean }>;
}) {
  const [older, setOlder] = useState<{ key: string; items: M[]; hasMore: boolean | null }>({
    key: input.resetKey,
    items: [],
    hasMore: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const current = older.key === input.resetKey ? older : { key: input.resetKey, items: [] as M[], hasMore: null };

  const messages = useMemo(() => {
    const latestIds = new Set(input.latest.map((m) => m.id));
    return [...current.items.filter((m) => !latestIds.has(m.id)), ...input.latest];
  }, [current.items, input.latest]);

  const hasMore = current.items.length ? current.hasMore === true : input.latestHasMore;

  const { fetchOlder, resetKey } = input;
  const loadOlder = useCallback(async () => {
    const anchor = messages[0]?.id;
    if (!anchor || loading) return;
    setLoading(true);
    setError(false);
    try {
      const page = await fetchOlder(anchor);
      setOlder((prev) => {
        const base = prev.key === resetKey ? prev.items : [];
        const seen = new Set(base.map((m) => m.id));
        return { key: resetKey, items: [...page.items.filter((m) => !seen.has(m.id)), ...base], hasMore: page.hasMore };
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchOlder, loading, messages, resetKey]);

  /** 누적분 안의 메시지 상태를 조치 결과에 맞춘다 (예: 숨김 토글). */
  const patchOlder = useCallback(
    (id: string, patch: Partial<M>) => {
      setOlder((prev) =>
        prev.key === resetKey ? { ...prev, items: prev.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : prev
      );
    },
    [resetKey]
  );

  return { messages, hasMore, loading, error, loadOlder, patchOlder };
}
