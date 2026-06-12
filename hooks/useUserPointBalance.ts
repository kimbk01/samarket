"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/** 클라이언트 — /api/me/points 잔액 조회 (세션 쿠키, mock 금지) */
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
      const res = await runSingleFlight("me:points:balance", () =>
        fetch("/api/me/points", { cache: "no-store", credentials: "include" })
      );
      if (!res.ok) {
        setBalance(0);
        return;
      }
      const j = (await res.json()) as { balance?: number };
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
