/**
 * 환율 조회
 * - fetchExchangeRatesViaApp: 쓰기 폼에서 사용. 우리 API(/api/exchange-rates) 호출 → 그 시점 현재 환율
 * - fetchExchangeRates: 서버 등에서 외부 API 직접 호출 시 (선택)
 */

import { runSingleFlight } from "@/lib/http/run-single-flight";

export interface ExchangeRates {
  PHP: number;
  KRW: number;
  USD?: number;
  JPY?: number;
  CNY?: number;
}

/** 쓰기 시점에 현재 환율 가져오기 (우리 API 경유 → 서버에서 외부 API 호출, CORS 없음) */
export async function fetchExchangeRatesViaApp(): Promise<ExchangeRates | null> {
  return runSingleFlight("exchange-rates:via-app", async () => {
    try {
      const res = await fetch("/api/exchange-rates", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.KRW == null || typeof data.KRW !== "number" || data.KRW <= 0) return null;
      return {
        PHP: 1,
        KRW: data.KRW,
        USD: typeof data.USD === "number" ? data.USD : undefined,
        JPY: typeof data.JPY === "number" ? data.JPY : undefined,
        CNY: typeof data.CNY === "number" ? data.CNY : undefined,
      };
    } catch {
      return null;
    }
  });
}

const EXTERNAL_API = "https://open.er-api.com/v6/latest/PHP";

/** 서버 등에서 외부 API 직접 호출 시 */
export async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const res = await fetch(EXTERNAL_API);
    if (!res.ok) return null;
    const data = await res.json();
    const rates = data?.rates;
    if (!rates || typeof rates.KRW !== "number") return null;
    return {
      PHP: 1,
      KRW: rates.KRW,
      USD: typeof rates.USD === "number" ? rates.USD : undefined,
      JPY: typeof rates.JPY === "number" ? rates.JPY : undefined,
      CNY: typeof rates.CNY === "number" ? rates.CNY : undefined,
    };
  } catch {
    return null;
  }
}
