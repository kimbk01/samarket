"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import {
  addressDisplayPartsFromUserAddress,
  formatAddressPublicArea,
} from "@/lib/addresses/address-display-levels";

/**
 * 새 상품(`/products/new`) 거래 지역 — 대표 주소의 시/군(① 공개 지역)만 보여 준다 (M5 · 주소 SSOT 2026-11-09).
 * 글 위치는 서버(`/api/posts/create` → `resolveTradePostLocationForUser`)가 대표 주소 행으로 정한다.
 * 이전: 앱 동네 목록(REGIONS) 선택칸 — 서버가 쓰지 않는 값이고, 목록 밖 대표 주소(Bacoor 등)는 다른 동네를 골라야 등록됐다.
 */
interface ProductLocationSelectProps {
  /** 대표 주소에 시/군 LGU 가 있으면 true */
  onReadyChange: (ready: boolean) => void;
  error?: string;
}

export function ProductLocationSelect({ onReadyChange, error }: ProductLocationSelectProps) {
  const { t } = useI18n();
  const [line, setLine] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await fetchAddressDefaultsSnapshot({
        caller: "product_new_location",
        reason: "composer_default_location",
      }).catch(() => null);
      if (cancelled) return;
      const master = snap?.ok ? coerceUserAddressDTO(snap.defaults?.master ?? null) : null;
      const city = formatAddressPublicArea(addressDisplayPartsFromUserAddress(master));
      const ready = Boolean(master && (master.canonicalLguId ?? "").trim() && city);
      setLine(ready ? city : null);
      setLoaded(true);
      onReadyChange(ready);
    })();
    return () => {
      cancelled = true;
    };
  }, [onReadyChange]);

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-2 sam-text-body font-medium text-sam-fg">
        {t("ui_product_trade_region_label")} <span className="text-red-500">*</span>
      </p>
      {line ? (
        <p className="sam-text-body text-sam-fg">{line}</p>
      ) : loaded || error ? (
        <p className="sam-text-body-secondary text-red-500" role="alert">
          {error || t("trade_write_err_region_read")}
        </p>
      ) : null}
    </section>
  );
}
