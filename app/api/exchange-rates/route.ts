import { NextResponse } from "next/server";
import { pickKrwSeries, pickLatestTwoKrw } from "@/lib/home/home-info-strip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHP → KRW 환율 (ECB 기준, Frankfurter) - 1 PHP = ? KRW.
 * 홈 정보 띠(슈퍼앱 개편 2026-11-26 §3①)가 전일 대비·기준일을 쓰므로 최근 10일 시계열 1회로
 * 마지막 영업일(KRW·date)과 그 전 영업일(prevKRW)을 함께 준다. 요청 수는 그대로 1회.
 */
/** 옛 주소 api.frankfurter.app 는 이 주소로 301 (2026-11-26 확인) */
const FRANKFURTER_ORIGIN = "https://api.frankfurter.dev/v1";
const SERIES_LOOKBACK_DAYS = 10;

function frankfurterSeriesUrl(now: number): string {
  const start = new Date(now - SERIES_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${FRANKFURTER_ORIGIN}/${start}..?from=PHP&to=KRW`;
}

const EXCHANGE_RATE_HTTP_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const revalidate = 300;

/** 쓰기 시점 현재 환율 조회. Frankfurter(ECB 기준)로 1 PHP = ? KRW 정확히 조회 */
export async function GET() {
  try {
    const res = await fetch(frankfurterSeriesUrl(Date.now()), {
      next: { revalidate: 300 },
      /** 바깥 서비스가 느려도 4초 안에 답한다 — 앱의 「DIBAY 연결 원활하지 않음」 판정(8초)에 걸리지 않게 */
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "exchange_rate_fetch_failed", code: "exchange_rate_fetch_failed", status: res.status },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    const data = await res.json();
    const picked = pickLatestTwoKrw(data?.rates);
    if (!picked) {
      return NextResponse.json(
        { error: "exchange_rate_invalid_data", code: "exchange_rate_invalid_data" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      {
        PHP: 1,
        KRW: picked.krw,
        prevKRW: picked.prevKrw,
        date: picked.date,
        /** 홈 태블릿 환율 꺾은선 — 최근 영업일 8개 (같은 요청, 설계 v2 §3-1) */
        series: pickKrwSeries(data?.rates).slice(-8),
      },
      { headers: { "Cache-Control": EXCHANGE_RATE_HTTP_CACHE_CONTROL } }
    );
  } catch (e) {
    console.error("[exchange-rates]", e);
    return NextResponse.json(
      { error: "exchange_rate_error", code: "exchange_rate_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
