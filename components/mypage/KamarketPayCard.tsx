"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function KamarketPayCard() {
  const { t } = useI18n();
  return (
    <Link href="/mypage/kamarket-pay" className="block">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-signature px-1.5 py-0.5 sam-text-xxs font-bold uppercase text-white">
            pay
          </span>
          <span className="sam-text-helper text-muted">{t("mypage_comp_kamarket_pay_tagline")}</span>
        </div>
        <span className="mt-3 block w-full rounded-ui-rect bg-signature py-2.5 text-center sam-text-body font-medium text-white">
          {t("mypage_comp_kamarket_pay_cta")}
        </span>
      </div>
    </Link>
  );
}
