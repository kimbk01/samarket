import { NextResponse } from "next/server";
import { pickLatestTwoKrw } from "@/lib/home/home-info-strip";

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
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "환율 조회 실패", status: res.status },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    const data = await res.json();
    const picked = pickLatestTwoKrw(data?.rates);
    if (!picked) {
      return NextResponse.json(
        { error: "환율 데이터 형식 오류" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      {
        PHP: 1,
        KRW: picked.krw,
        prevKRW: picked.prevKrw,
        date: picked.date,
      },
      { headers: { "Cache-Control": EXCHANGE_RATE_HTTP_CACHE_CONTROL } }
    );
  } catch (e) {
    console.error("[exchange-rates]", e);
    return NextResponse.json(
      { error: "환율 조회 중 오류" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
