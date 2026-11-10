"use client";

import { useEffect, useState } from "react";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import { defaultTradePriceCurrencyForCountry, type TradePriceCurrency } from "@/lib/trade/trade-price-currency";

/**
 * 대표 주소 나라 → 거래 가격 기본 통화 (한국 → KRW, 그 밖 → PHP).
 * 하이드레이션 뒤에만 읽는다. 캐시가 없으면(글쓰기로 바로 진입) 같은 단일 비행 캐시로 한 번 받아 온다
 * (실기 2026-11-10: 한국 대표인데 「페소」 기본 → 수정). 일반·일자리 글쓰기와 글쓰기 시트 첫 단계가 같이 쓴다.
 */
export function useMasterDefaultTradePriceCurrency(): TradePriceCurrency {
  const [value, setValue] = useState<TradePriceCurrency>("PHP");
  useEffect(() => {
    const apply = (snap: Awaited<ReturnType<typeof fetchAddressDefaultsSnapshot>>) => {
      const master = (snap?.ok ? (snap.defaults?.master as { countryCode?: string } | null) : null) ?? null;
      setValue(defaultTradePriceCurrencyForCountry(master?.countryCode));
    };
    const peek = peekFreshAddressDefaultsSnapshot();
    if (peek) {
      apply(peek);
      return;
    }
    let cancelled = false;
    void fetchAddressDefaultsSnapshot({ caller: "trade_default_location_block", reason: "composer_default_location" })
      .then((snap) => {
        if (!cancelled) apply(snap);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}
