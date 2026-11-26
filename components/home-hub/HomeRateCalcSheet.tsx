"use client";

import { useEffect, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { convertPhpKrw } from "@/lib/home/home-info-strip";
import { homePressFromClick } from "@/lib/ui/home-press-feedback";

function parseAmount(v: string): number {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 환율 계산 시트 — ₱ ↔ ₩ (설계 §1·§3①). 위 칸에 입력하면 아래 칸이 바로 계산된다. 「위아래 바꾸기」로 방향 전환.
 * 숫자 입력에는 진동·소리 없음(§5-2). 새 페이지·새 요청 없음 — 정보 띠가 받은 환율을 그대로 쓴다.
 */
export function HomeRateCalcSheet({
  open,
  onClose,
  rate,
}: {
  open: boolean;
  onClose: () => void;
  rate: ExchangeRates | null;
}) {
  const { t } = useI18n();
  const [dir, setDir] = useState<"php_to_krw" | "krw_to_php">("php_to_krw");
  const [input, setInput] = useState("1000");

  useEffect(() => {
    if (!open) return;
    setDir("php_to_krw");
    setInput("1000");
  }, [open]);

  const krwPerPhp = rate?.KRW ?? 0;
  const out = convertPhpKrw(parseAmount(input), krwPerPhp, dir);
  const fromLabel = dir === "php_to_krw" ? t("home_rate_calc_php") : t("home_rate_calc_krw");
  const toLabel = dir === "php_to_krw" ? t("home_rate_calc_krw") : t("home_rate_calc_php");
  const outText = out.toLocaleString(undefined, { maximumFractionDigits: dir === "php_to_krw" ? 0 : 2 });

  return (
    <DibayBottomSheet open={open} onClose={onClose} title={t("home_rate_calc_title")}>
      <div className="grid gap-3 pb-2" data-home-rate-calc>
        <label className="grid gap-1.5">
          <span className="sam-text-helper text-sam-muted">{fromLabel}</span>
          <input
            inputMode="decimal"
            className="h-12 rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[20px] font-bold text-sam-fg"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d.,]/g, ""))}
            data-home-rate-input
          />
        </label>
        <button
          type="button"
          className="home-press mx-auto inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-sam-border bg-sam-surface px-4 text-[13px] font-bold text-sam-fg"
          onClick={(e) => {
            homePressFromClick("tap", e);
            setDir((d) => (d === "php_to_krw" ? "krw_to_php" : "php_to_krw"));
            setInput(String(out || ""));
          }}
          data-home-rate-swap
        >
          <ArrowDownUp className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          {t("home_rate_calc_swap")}
        </button>
        <div className="grid gap-1.5">
          <span className="sam-text-helper text-sam-muted">{toLabel}</span>
          <output className="flex h-12 items-center rounded-ui-rect bg-sam-app px-3 text-[20px] font-extrabold text-sam-primary" data-home-rate-output>
            {outText}
          </output>
        </div>
        {rate?.date ? <p className="sam-text-helper text-sam-muted">{t("home_rate_calc_note", { date: rate.date })}</p> : null}
      </div>
    </DibayBottomSheet>
  );
}

/** 정보 띠를 어드민에서 끈 경우 — 서비스 「환율 계산」 칸이 여는 시트가 열릴 때 환율을 받는다 */
export function HomeRateCalcStandalone({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rate, setRate] = useState<ExchangeRates | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchExchangeRatesViaApp().then((r) => {
      if (alive && r) setRate(r);
    });
    return () => {
      alive = false;
    };
  }, [open]);
  return <HomeRateCalcSheet open={open} onClose={onClose} rate={rate} />;
}
