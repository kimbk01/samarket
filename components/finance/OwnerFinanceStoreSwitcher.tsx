"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ownerFinanceSectionHref } from "@/lib/finance/routes";

type StoreOpt = { id: string; name: string };

export function OwnerFinanceStoreSwitcher({
  storeId,
  section,
  ko,
}: {
  storeId: string;
  section: string;
  ko: boolean;
}) {
  const router = useRouter();
  const [stores, setStores] = useState<StoreOpt[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: Array<{ id: string; store_name?: string | null; name?: string | null }>;
        };
        if (cancelled || !res.ok || json.ok === false) return;
        setStores(
          (json.stores ?? []).map((s) => ({
            id: String(s.id),
            name: String(s.store_name || s.name || s.id).trim() || s.id,
          }))
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (stores.length <= 1) return null;

  return (
    <label className="block text-sm" data-owner-finance-store-switcher="1">
      <span className="text-sam-muted">{ko ? "매장" : "Store"}</span>
      <select
        className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
        value={storeId}
        onChange={(e) => {
          const next = e.target.value;
          const sec = (section || "transactions") as
            | "transactions"
            | "orders"
            | "outstanding"
            | "coin"
            | "cash"
            | "ads"
            | "convert"
            | "withdraw";
          router.push(ownerFinanceSectionHref(next, sec));
        }}
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
