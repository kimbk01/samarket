"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export function MyPointCard() {
  const { t } = useI18n();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await runSingleFlight("me:points:get", () =>
          fetch("/api/me/points", { cache: "no-store" })
        );
        const j = (await r.clone().json()) as { balance?: number };
        if (typeof j.balance === "number") {
          const nextBalance = j.balance;
          setBalance((prev) => (prev === nextBalance ? prev : nextBalance));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <Link href="/mypage/points" className="block">
      <div className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-signature/10">
            <span className="sam-text-body font-bold text-signature">P</span>
          </div>
          <div>
            <p className="sam-text-xxs font-medium text-muted">{t("mypage_comp_points_card_title")}</p>
            <p className="sam-text-section-title font-bold text-foreground">
              {balance === null ? "…" : `${balance.toLocaleString()}P`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-semibold text-white">
            {t("mypage_comp_points_charge_request")}
          </span>
          <span className="text-muted">›</span>
        </div>
      </div>
    </Link>
  );
}
