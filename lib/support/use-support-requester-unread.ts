"use client";

import { useEffect, useState } from "react";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import {
  getSupportModalState,
  subscribeSupportModalState,
} from "@/lib/support/support-modal-controller";

/**
 * Phase 3 B5/B6 — requester-side support unread SSOT for entry badges.
 * Sum of `support_cases.requester_unread_count` from the existing history API (same rows the
 * 상담 내역 list shows), so the hub row / Owner Care badge can never disagree with the list.
 * Re-reads when the support sheet closes (the customer may have just read a case).
 * Fail-soft: errors keep the last value (badge is informational, never blocks entry).
 */
export function useSupportRequesterUnread(input: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
  enabled?: boolean;
}): number {
  const { audience, storeId, enabled = true } = input;
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let wasOpen = getSupportModalState().phase === "open";
    return subscribeSupportModalState(() => {
      const open = getSupportModalState().phase === "open";
      if (wasOpen && !open) setTick((n) => n + 1);
      wasOpen = open;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (audience === "OWNER" && !storeId) return;
    let cancelled = false;
    const qs = new URLSearchParams({ audience });
    if (audience === "OWNER" && storeId) qs.set("storeId", storeId);
    void (async () => {
      try {
        const res = await fetch(`/api/support/cases?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          cases?: Pick<SupportCaseRow, "requester_unread_count">[];
        };
        if (cancelled || !res.ok || !json.ok) return;
        const sum = (json.cases ?? []).reduce(
          (acc, c) => acc + Math.max(0, Number(c.requester_unread_count) || 0),
          0
        );
        setCount(sum);
      } catch {
        /* fail-soft — keep last value */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, storeId, enabled, tick]);

  return count;
}
