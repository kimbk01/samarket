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
 */
export function useUserPointBalance(_userId?: string | null): {
  balance: number;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

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
      setBalance(Math.max(0, Number(j.balance ?? 0)));
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, refresh };
}
