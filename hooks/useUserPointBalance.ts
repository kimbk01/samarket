"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type PointsBalanceJson = { balance?: number };

/**
 * 클라이언트 — /api/me/points 잔액 조회 (세션 쿠키, mock 금지).
 *
 * CRITICAL: single-flight MUST share parsed JSON, never the raw Response.
 * Concurrent callers (Strict Mode remount, multiple hook instances) joining the
 * same Response would race on body stream — second `res.json()` fails → UI stuck at 0
 * while a later `/api/me/points` probe still shows the real balance.
 *
 * MYPAGE-03: fetch failure must not be presented as balance 0 — use `error`.
 * D4: 음수(시스템 회수 후 미정산)는 실제 잔액 — 0 으로 자르지 않는다(financial hard-lock §8).
 */
export function useUserPointBalance(_userId?: string | null): {
  balance: number;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const j = await runSingleFlight("me:points:balance", async (): Promise<PointsBalanceJson> => {
        const res = await fetch("/api/me/points", { cache: "no-store", credentials: "include" });
        if (!res.ok) {
          throw new Error(`points_http_${res.status}`);
        }
        return (await res.json()) as PointsBalanceJson;
      });
      const next = Number(j.balance);
      if (!Number.isFinite(next)) throw new Error("points_balance_missing");
      setBalance(Math.trunc(next));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, error, refresh };
}
