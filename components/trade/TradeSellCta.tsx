"use client";

import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SellerHubEmptyActionLink } from "@/components/mypage/seller/SellerHubEmptyState";

/** 거래 판매 등록 CTA 표기 SSOT — 「판매하기」 + Plus (위치·진입 경로는 각 화면 그대로) */
export function TradeSellCtaContent() {
  const { t } = useI18n();
  return (
    <>
      <Plus className="h-5 w-5 shrink-0" aria-hidden />
      <span>{t("trade_write_sell_cta")}</span>
    </>
  );
}

/** 빈 목록의 판매 진입 — 헤더 「판매하기」와 같은 `/market/sell` */
export function TradeSellEmptyAction() {
  return (
    <SellerHubEmptyActionLink href="/market/sell" variant="primary">
      <span className="inline-flex items-center justify-center gap-2">
        <TradeSellCtaContent />
      </span>
    </SellerHubEmptyActionLink>
  );
}
